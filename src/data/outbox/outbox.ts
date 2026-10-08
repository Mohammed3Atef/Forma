import { create } from 'zustand';
import { currentLocalOwner, userStore } from '@/data/localScope';
import { blobStore } from '@/data/blobStore';
import { classifyError, type ErrorKind } from '@/lib/errorKind';
import { registerCriticalWork } from '@/lib/criticalWork';

/**
 * The durable OUTBOX (B1.6 / PWA-12): user-generated writes that must survive
 * a reload, an OS kill or a dead connection, and must never be lost silently
 * or sent twice.
 *
 * Guarantees
 *  1. Survives reload / PWA kill — every op lives in the account's own
 *     IndexedDB (`forma-u-<uid>/outbox`) before anything is sent; attachment
 *     bytes live in the same account's blob store.
 *  2. Isolated per user — ops are read from, and processed for, the OPEN
 *     account only; each op records its `userId` and is refused if the open
 *     account is anyone else (it can never be sent under another account).
 *  3. Idempotent + retry-safe — `operationId` is generated once and sent as the
 *     server's idempotency key (message `clientMsgId`, check-in `opId`); upload
 *     results are cached on the op so a retry never re-uploads.
 *  4. Complete only on server acknowledgement — `acknowledged` is set from the
 *     handler's resolved response, nothing else.
 *  5. Visible + recoverable failures — retryable failures back off and retry by
 *     themselves (reconnect, foreground, timer); permanent ones wait for the
 *     user (Retry / Discard). Technical states are never shown verbatim.
 *  6. No duplicate logical action — a `dedupeKey` replaces a not-yet-sent op
 *     for the same thing (e.g. one check-in submission per week).
 *
 * Ordering: ops sharing a `scope` (one message thread, one check-in) are sent
 * oldest-first, one at a time; `dependencyIds` hold an op until those ops are
 * acknowledged or gone (a caption waits for its attachment).
 *
 * Commercial and security-sensitive actions are deliberately NOT queued — they
 * stay online-required (see the foundation spec §12).
 */

export type OutboxStatus = 'queued' | 'sending' | 'waiting_for_network' | 'failed_retryable' | 'failed_permanent' | 'acknowledged';
export type OutboxType = 'message.send' | 'checkin.submit' | 'progressPhoto.upload';

export interface OutboxMedia {
  url: string;
  kind?: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface OutboxOp<P = unknown> {
  operationId: string;
  userId: string;
  type: OutboxType;
  /** Ops in one scope are delivered in order, one at a time. */
  scope: string;
  /** One logical action = one op: a new op with the same key replaces an unsent one. */
  dedupeKey?: string;
  payload: P;
  /** Per-user blob-store keys this op owns (removed once acknowledged or discarded). */
  blobKeys?: string[];
  /** Upload results, so a retry never uploads the same bytes twice. */
  media?: Record<string, OutboxMedia>;
  dependencyIds?: string[];
  createdAt: number;
  updatedAt: number;
  status: OutboxStatus;
  attemptCount: number;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  lastError?: { kind: ErrorKind; code?: string };
  serverAcknowledgedAt?: number;
  /** The server's response (e.g. the created message). */
  result?: unknown;
}

export interface OutboxHandlerContext {
  signal: AbortSignal;
  /** Persist an upload result on the op before continuing. */
  setMedia: (key: string, media: OutboxMedia) => Promise<void>;
  progress: (fraction: number) => void;
}
export type OutboxHandler = (op: OutboxOp, ctx: OutboxHandlerContext) => Promise<unknown>;

const handlers = new Map<OutboxType, OutboxHandler>();
export function registerOutboxHandler(type: OutboxType, handler: OutboxHandler): void {
  handlers.set(type, handler);
}

/** A permanent, op-level failure raised by a handler (e.g. its local blob is gone). */
export class OutboxPermanentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Acknowledged ops stay briefly so screens can swap the pending row for the server's. */
export const ACK_RETENTION_MS = 30_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const UNAVAILABLE_BACKOFF_MS = 5 * 60_000;

export function backoffMs(attempt: number, kind?: ErrorKind): number {
  if (kind === 'unavailable') return UNAVAILABLE_BACKOFF_MS;
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
  const floor = kind === 'rate_limited' ? 30_000 : 0;
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.max(floor, Math.round(base * jitter));
}

const store = () => userStore('outbox');

interface OutboxState {
  /** Ops of the open account (mirror of IndexedDB). */
  ops: OutboxOp[];
  /** Upload progress of the op being sent (0–1). */
  progress: Record<string, number>;
}
export const useOutbox = create<OutboxState>(() => ({ ops: [], progress: {} }));

type AckListener = (op: OutboxOp) => void;
const ackListeners = new Set<AckListener>();
/** Called once per op when the server acknowledges it. */
export function onOutboxAck(fn: AckListener): () => void {
  ackListeners.add(fn);
  return () => ackListeners.delete(fn);
}

let activeUid: string | null = null;
let running: Promise<void> | null = null;
let stopping = false;
let inFlight: { id: string; ctrl: AbortController; cancelledByUser: boolean; done: Promise<void> } | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
const settleWaiters = new Map<string, ((op: OutboxOp | null) => void)[]>();

function setOps(ops: OutboxOp[]) {
  useOutbox.setState({ ops: [...ops].sort((a, b) => a.createdAt - b.createdAt) });
}
function getOp(id: string): OutboxOp | undefined {
  return useOutbox.getState().ops.find((o) => o.operationId === id);
}
async function save(op: OutboxOp): Promise<void> {
  if (op.userId !== currentLocalOwner()) return; // never write into another account's database
  await store().setItem(op.operationId, op);
  setOps([...useOutbox.getState().ops.filter((o) => o.operationId !== op.operationId), op]);
}
async function drop(op: OutboxOp): Promise<void> {
  if (op.userId === currentLocalOwner()) {
    await store().removeItem(op.operationId);
    for (const k of op.blobKeys ?? []) await blobStore.remove(k).catch(() => undefined);
  }
  setOps(useOutbox.getState().ops.filter((o) => o.operationId !== op.operationId));
}
function settle(op: OutboxOp | null, id: string) {
  const ws = settleWaiters.get(id);
  if (!ws) return;
  settleWaiters.delete(id);
  for (const w of ws) w(op);
}
function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Load the open account's queue and start delivering it. Call after `openAccountScope(uid)`. */
export async function startOutbox(uid: string): Promise<void> {
  if (activeUid === uid) return;
  if (activeUid) await stopOutbox();
  if (currentLocalOwner() !== uid) return;
  activeUid = uid;
  stopping = false;
  const ops: OutboxOp[] = [];
  await store().iterate<OutboxOp, void>((op) => {
    ops.push(op);
  });
  const now = Date.now();
  const keep: OutboxOp[] = [];
  for (const op of ops) {
    if (op.userId !== uid) continue; // foreign record (should never exist) — never touched
    if (op.status === 'acknowledged' && now - (op.serverAcknowledgedAt ?? 0) > ACK_RETENTION_MS) {
      await store().removeItem(op.operationId);
      for (const k of op.blobKeys ?? []) await blobStore.remove(k).catch(() => undefined);
      continue;
    }
    // An op that was "sending" when the app died is just queued again (idempotent).
    if (op.status === 'sending') op.status = 'queued';
    keep.push(op);
  }
  if (activeUid !== uid) return;
  setOps(keep);
  attachTriggers();
  kickOutbox();
}

/** Stop for an account switch / sign-out: finishes or interrupts the op in flight, keeps everything queued. */
export async function stopOutbox(): Promise<void> {
  if (!activeUid) return;
  stopping = true;
  detachTriggers();
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  inFlight?.ctrl.abort();
  await running?.catch(() => undefined);
  activeUid = null;
  stopping = false;
  useOutbox.setState({ ops: [], progress: {} });
}

/** Queue a write. Resolves once it is safely stored on the device (not when sent). */
export async function enqueueOutbox<P>(input: {
  operationId: string;
  type: OutboxType;
  scope: string;
  payload: P;
  dedupeKey?: string;
  blobKeys?: string[];
  dependencyIds?: string[];
  media?: Record<string, OutboxMedia>;
}): Promise<OutboxOp<P>> {
  const uid = currentLocalOwner();
  if (!uid || uid !== activeUid) throw new Error('outbox: no open account');
  if (input.dedupeKey) {
    const prev = useOutbox.getState().ops.find((o) => o.dedupeKey === input.dedupeKey && o.status !== 'acknowledged');
    if (prev && prev.status === 'sending') throw new Error('outbox: already sending');
    if (prev) await drop(prev);
  }
  const now = Date.now();
  const op: OutboxOp<P> = {
    operationId: input.operationId,
    userId: uid,
    type: input.type,
    scope: input.scope,
    dedupeKey: input.dedupeKey,
    payload: input.payload,
    blobKeys: input.blobKeys,
    media: input.media,
    dependencyIds: input.dependencyIds,
    createdAt: now,
    updatedAt: now,
    status: online() ? 'queued' : 'waiting_for_network',
    attemptCount: 0,
  };
  await save(op as OutboxOp);
  kickOutbox();
  return op;
}

/** Retry now (resets the backoff; a permanent failure gets one more attempt). */
export async function retryOutbox(id: string): Promise<void> {
  const op = getOp(id);
  if (!op || op.status === 'sending' || op.status === 'acknowledged') return;
  await save({ ...op, status: online() ? 'queued' : 'waiting_for_network', nextAttemptAt: undefined, updatedAt: Date.now() });
  kickOutbox();
}

/** Throw away an unsent op (and its local bytes). Returns the op so a screen can restore its content. */
export async function discardOutbox(id: string): Promise<OutboxOp | null> {
  const op = getOp(id);
  if (!op || op.status === 'acknowledged') return null;
  if (inFlight?.id === id) {
    const attemptDone = inFlight.done;
    inFlight.cancelledByUser = true;
    inFlight.ctrl.abort();
    await attemptDone; // only this attempt — not the rest of the queue
  }
  const cur = getOp(id) ?? op;
  if (cur.status === 'acknowledged') return null; // it made it after all
  await drop(cur);
  settle(null, id);
  return cur;
}

/** Resolves after the op's FIRST delivery attempt settles (or at once when offline). */
export function waitForFirstAttempt(id: string, timeoutMs = 60_000): Promise<OutboxOp | null> {
  const op = getOp(id);
  if (!op) return Promise.resolve(null);
  if (op.status !== 'queued' && op.status !== 'sending') return Promise.resolve(op);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(getOp(id) ?? null), timeoutMs);
    const list = settleWaiters.get(id) ?? [];
    list.push((o) => {
      clearTimeout(t);
      resolve(o);
    });
    settleWaiters.set(id, list);
  });
}

export function isOutboxSending(): boolean {
  return useOutbox.getState().ops.some((o) => o.status === 'sending');
}

/** Process the queue now (no-op while a pass is running — it picks new work up itself). */
export function kickOutbox(): void {
  if (!activeUid || stopping) return;
  if (running) return;
  running = runLoop().finally(() => {
    running = null;
  });
}

function eligible(now: number): OutboxOp | null {
  const ops = useOutbox.getState().ops;
  const pendingIds = new Set(ops.filter((o) => o.status !== 'acknowledged').map((o) => o.operationId));
  const headOfScope = new Map<string, OutboxOp>();
  for (const op of ops) {
    if (op.status === 'acknowledged' || op.status === 'failed_permanent') continue;
    if (!headOfScope.has(op.scope)) headOfScope.set(op.scope, op);
  }
  for (const op of headOfScope.values()) {
    if (op.status === 'sending') continue;
    if (op.nextAttemptAt && op.nextAttemptAt > now) continue;
    if ((op.dependencyIds ?? []).some((d) => pendingIds.has(d))) continue;
    if (!handlers.has(op.type)) continue;
    return op;
  }
  return null;
}

async function runLoop(): Promise<void> {
  while (activeUid && !stopping) {
    if (!online()) {
      for (const op of useOutbox.getState().ops) {
        if (op.status === 'queued' || op.status === 'failed_retryable') await save({ ...op, status: 'waiting_for_network', updatedAt: Date.now() });
      }
      return;
    }
    const op = eligible(Date.now());
    if (!op) {
      scheduleWake();
      return;
    }
    await attempt(op);
  }
}

function scheduleWake() {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  const next = useOutbox
    .getState()
    .ops.filter((o) => o.status === 'failed_retryable' && o.nextAttemptAt)
    .map((o) => o.nextAttemptAt!)
    .sort((a, b) => a - b)[0];
  if (next) wakeTimer = setTimeout(kickOutbox, Math.max(250, next - Date.now()));
}

async function attempt(op0: OutboxOp): Promise<void> {
  const uid = activeUid;
  if (!uid || op0.userId !== uid || currentLocalOwner() !== uid) return;
  const handler = handlers.get(op0.type)!;
  let op: OutboxOp = { ...op0, status: 'sending', attemptCount: op0.attemptCount + 1, lastAttemptAt: Date.now(), updatedAt: Date.now() };
  await save(op);
  const ctrl = new AbortController();
  let attemptSettled: () => void = () => undefined;
  const done = new Promise<void>((r) => (attemptSettled = r));
  inFlight = { id: op.operationId, ctrl, cancelledByUser: false, done };
  const ctx: OutboxHandlerContext = {
    signal: ctrl.signal,
    setMedia: async (key, media) => {
      op = { ...op, media: { ...(op.media ?? {}), [key]: media }, updatedAt: Date.now() };
      if (activeUid === uid) await save(op);
    },
    progress: (fraction) => useOutbox.setState((s) => ({ progress: { ...s.progress, [op.operationId]: fraction } })),
  };
  try {
    const result = await handler(op, ctx);
    if (activeUid !== uid || currentLocalOwner() !== uid) return; // switched mid-send: it stays sending → requeued on next start
    op = { ...op, status: 'acknowledged', serverAcknowledgedAt: Date.now(), result, lastError: undefined, nextAttemptAt: undefined, updatedAt: Date.now() };
    await save(op);
    for (const k of op.blobKeys ?? []) await blobStore.remove(k).catch(() => undefined);
    for (const fn of ackListeners) {
      try {
        fn(op);
      } catch (e) {
        console.error('[outbox] ack listener failed:', e);
      }
    }
    settle(op, op.operationId);
  } catch (e) {
    if (activeUid !== uid || currentLocalOwner() !== uid) return;
    const userCancelled = inFlight?.cancelledByUser;
    if (userCancelled) return; // discardOutbox removes it
    const c = e instanceof OutboxPermanentError ? { kind: 'permanent' as ErrorKind, code: e.code, retryable: false } : classifyError(e);
    let status: OutboxStatus;
    if (c.kind === 'cancelled') status = 'queued'; // interrupted by stop(): try again next time
    else if (!online() || c.kind === 'network' || c.kind === 'timeout') status = online() ? 'failed_retryable' : 'waiting_for_network';
    else if (c.retryable) status = 'failed_retryable';
    else status = 'failed_permanent';
    op = {
      ...op,
      status,
      lastError: { kind: c.kind, code: c.code },
      nextAttemptAt: status === 'failed_retryable' ? Date.now() + backoffMs(op.attemptCount, c.kind) : undefined,
      updatedAt: Date.now(),
    };
    await save(op);
    if (c.kind !== 'cancelled') console.warn(`[outbox] ${op.type} ${status} (${c.kind}${c.code ? `:${c.code}` : ''})`);
    settle(op, op.operationId);
  } finally {
    inFlight = null;
    attemptSettled();
    useOutbox.setState((s) => {
      const { [op.operationId]: _done, ...rest } = s.progress;
      return { progress: rest };
    });
  }
}

// ---- triggers: reconnect, foreground --------------------------------------

function onOnline() {
  void (async () => {
    for (const op of useOutbox.getState().ops) {
      if (op.status === 'waiting_for_network') await save({ ...op, status: 'queued', nextAttemptAt: undefined, updatedAt: Date.now() });
    }
    kickOutbox();
  })();
}
function onVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') kickOutbox();
}
function attachTriggers() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
}
function detachTriggers() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
}

/** Test-only reset (module state is process-global). */
export function __resetOutboxForTests(): void {
  detachTriggers();
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  activeUid = null;
  running = null;
  stopping = false;
  inFlight = null;
  settleWaiters.clear();
  // Ack listeners are module-level subscriptions (e.g. photoStore) — kept.
  useOutbox.setState({ ops: [], progress: {} });
}

// An upload/send in flight would restart from scratch after a reload (B0.7).
registerCriticalWork('outbox-sending', isOutboxSending, useOutbox.subscribe);
