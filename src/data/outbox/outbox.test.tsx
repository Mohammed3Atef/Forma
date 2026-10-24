import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory localforage keyed by `${db}/${store}` — jsdom has no IndexedDB.
const dbs = new Map<string, Map<string, unknown>>();
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!dbs.has(key)) dbs.set(key, new Map());
      return dbs.get(key)!;
    };
    return {
      getItem: async (k: string) => (m().has(k) ? structuredClone(m().get(k)) : null),
      setItem: async (k: string, v: unknown) => {
        m().set(k, v instanceof Blob ? v : structuredClone(v));
        return v;
      },
      removeItem: async (k: string) => void m().delete(k),
      clear: async () => m().clear(),
      keys: async () => [...m().keys()],
      iterate: async (fn: (v: unknown, k: string, i: number) => unknown) => {
        let i = 0;
        for (const [k, v] of m()) {
          const r = fn(v instanceof Blob ? v : structuredClone(v), k, i++);
          if (r !== undefined) return r;
        }
      },
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(o.name, o.storeName) } };
});

import { closeAccountScope, openAccountScope } from '../localScope';
import { blobStore } from '../blobStore';
import {
  __resetOutboxForTests,
  discardOutbox,
  enqueueOutbox,
  kickOutbox,
  onOutboxAck,
  registerOutboxHandler,
  retryOutbox,
  startOutbox,
  stopOutbox,
  useOutbox,
  waitForFirstAttempt,
  type OutboxOp,
} from './outbox';

let isOnline = true;
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => isOnline });

const trpcError = (code: string) => Object.assign(new Error(code), { name: 'TRPCClientError', data: { code, httpStatus: code === 'BAD_REQUEST' ? 400 : 500 } });
const networkError = () => Object.assign(new Error('Failed to fetch'), { name: 'TRPCClientError', data: undefined, cause: new TypeError('Failed to fetch') });

const calls: { id: string; userId: string; owner: string | null }[] = [];
let behaviour: (op: OutboxOp, attempt: number) => Promise<unknown> = async () => ({ ok: true });
const attempts = new Map<string, number>();

async function open(uid: string) {
  await stopOutbox();
  closeAccountScope();
  await openAccountScope(uid);
  await startOutbox(uid);
}
const op = (id: string) => useOutbox.getState().ops.find((o) => o.operationId === id);
async function settled(id: string) {
  await waitForFirstAttempt(id, 2000);
  await new Promise((r) => setTimeout(r, 0));
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  dbs.clear();
  calls.length = 0;
  attempts.clear();
  isOnline = true;
  behaviour = async () => ({ ok: true });
  __resetOutboxForTests();
  closeAccountScope();
  const { currentLocalOwner } = await import('../localScope');
  registerOutboxHandler('message.send', async (o) => {
    const n = (attempts.get(o.operationId) ?? 0) + 1;
    attempts.set(o.operationId, n);
    calls.push({ id: o.operationId, userId: o.userId, owner: currentLocalOwner() });
    return behaviour(o, n);
  });
});
afterEach(async () => {
  await stopOutbox();
  __resetOutboxForTests();
});

const enqueue = (operationId: string, extra: Partial<Parameters<typeof enqueueOutbox>[0]> = {}) =>
  enqueueOutbox({ operationId, type: 'message.send', scope: 'thread:c1', payload: { text: operationId }, ...extra });

describe('durable outbox (B1.6 / PWA-12)', () => {
  it('survives a reload / app kill: a queued op is still there and is delivered after the restart', async () => {
    await open('client-a');
    isOnline = false;
    await enqueue('op-1');
    expect(op('op-1')?.status).toBe('waiting_for_network');
    // App killed: memory gone, no orderly stop.
    __resetOutboxForTests();
    isOnline = true;
    await open('client-a');
    await settled('op-1');
    expect(op('op-1')?.status).toBe('acknowledged');
    expect(calls).toEqual([{ id: 'op-1', userId: 'client-a', owner: 'client-a' }]);
  });

  it('an op that was mid-send when the app died is sent again with the SAME id (idempotent)', async () => {
    await open('client-a');
    let release: () => void = () => undefined;
    behaviour = () => new Promise((r) => (release = () => r({ ok: true })));
    await enqueue('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('sending');
    __resetOutboxForTests(); // killed mid-flight
    release();
    behaviour = async () => ({ ok: true });
    await open('client-a');
    await settled('op-1');
    expect(op('op-1')?.status).toBe('acknowledged');
    expect(calls.map((c) => c.id)).toEqual(['op-1', 'op-1']);
  });

  it('is isolated per user: B never sees or sends A’s queue; A’s op is sent under A when A returns', async () => {
    await open('client-a');
    isOnline = false;
    await enqueue('op-a');
    isOnline = true;
    await open('client-b');
    await flush();
    expect(useOutbox.getState().ops).toEqual([]);
    expect(calls).toEqual([]);
    await open('client-a');
    await settled('op-a');
    expect(calls).toEqual([{ id: 'op-a', userId: 'client-a', owner: 'client-a' }]);
  });

  it('refuses to enqueue when no account is open', async () => {
    await expect(enqueue('op-x')).rejects.toThrow(/no open account/);
  });

  it('is complete only on server acknowledgement, keeping the result and dropping the local bytes', async () => {
    await open('client-a');
    await blobStore.put('outbox:op-1', new Blob(['x']));
    behaviour = async () => ({ id: 'server-msg-1' });
    const acks: string[] = [];
    onOutboxAck((o) => acks.push(o.operationId));
    await enqueue('op-1', { blobKeys: ['outbox:op-1'] });
    await settled('op-1');
    expect(op('op-1')).toMatchObject({ status: 'acknowledged', result: { id: 'server-msg-1' } });
    expect(op('op-1')?.serverAcknowledgedAt).toEqual(expect.any(Number));
    expect(await blobStore.get('outbox:op-1')).toBeNull();
    expect(acks).toEqual(['op-1']);
  });

  it('retries a retryable failure with backoff and the same operation id', async () => {
    await open('client-a');
    behaviour = async (_o, n) => {
      if (n === 1) throw trpcError('INTERNAL_SERVER_ERROR');
      return { ok: true };
    };
    await enqueue('op-1');
    await settled('op-1');
    expect(op('op-1')).toMatchObject({ status: 'failed_retryable', lastError: { kind: 'server' } });
    expect(op('op-1')?.nextAttemptAt).toBeGreaterThan(Date.now());
    await retryOutbox('op-1');
    await settled('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('acknowledged');
    expect(calls.map((c) => c.id)).toEqual(['op-1', 'op-1']);
  });

  it('a rate-limit refusal keeps the op and waits at least as long as the server asked (B36-R4)', async () => {
    await open('client-a');
    behaviour = async (_o, n) => {
      if (n === 1) throw Object.assign(new Error('TOO_MANY_REQUESTS'), { name: 'TRPCClientError', data: { code: 'TOO_MANY_REQUESTS', httpStatus: 429, reason: 'RATE_LIMITED', retryAfter: 420 } });
      return { ok: true };
    };
    const before = Date.now();
    await enqueue('op-rl');
    await settled('op-rl');
    expect(op('op-rl')).toMatchObject({ status: 'failed_retryable', lastError: { kind: 'rate_limited', reason: 'RATE_LIMITED' } });
    // Not the 30 s rate-limit floor: the window reopens in 420 s.
    expect(op('op-rl')!.nextAttemptAt!).toBeGreaterThanOrEqual(before + 420_000);
    await retryOutbox('op-rl');
    await settled('op-rl');
    await flush();
    expect(op('op-rl')?.status).toBe('acknowledged');
    expect(calls.map((c) => c.id)).toEqual(['op-rl', 'op-rl']);
  });

  it('a permanent failure waits for the user (no automatic retry); Retry tries again', async () => {
    await open('client-a');
    behaviour = async () => {
      throw trpcError('BAD_REQUEST');
    };
    await enqueue('op-1');
    await settled('op-1');
    expect(op('op-1')).toMatchObject({ status: 'failed_permanent', lastError: { kind: 'permanent', code: 'BAD_REQUEST' } });
    kickOutbox();
    await flush();
    expect(calls).toHaveLength(1);
    behaviour = async () => ({ ok: true });
    await retryOutbox('op-1');
    await settled('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('acknowledged');
  });

  it('offline → waiting for network; reconnect delivers it', async () => {
    await open('client-a');
    isOnline = false;
    await enqueue('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('waiting_for_network');
    expect(calls).toEqual([]);
    isOnline = true;
    window.dispatchEvent(new Event('online'));
    await settled('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('acknowledged');
  });

  it('a connection drop during send is retryable, not a failure the user must handle', async () => {
    await open('client-a');
    behaviour = async () => {
      throw networkError();
    };
    await enqueue('op-1');
    await settled('op-1');
    expect(op('op-1')).toMatchObject({ status: 'failed_retryable', lastError: { kind: 'network' } });
  });

  it('dedupe key: queuing the same logical action again replaces the unsent op (no duplicate)', async () => {
    await open('client-a');
    isOnline = false;
    await enqueue('op-1', { dedupeKey: 'checkin:w1' });
    await enqueue('op-2', { dedupeKey: 'checkin:w1' });
    expect(useOutbox.getState().ops.map((o) => o.operationId)).toEqual(['op-2']);
  });

  it('keeps order within a scope and holds a dependent op until its dependency is gone or acknowledged', async () => {
    await open('client-a');
    behaviour = async (o) => {
      if (o.operationId === 'attachment') throw trpcError('BAD_REQUEST');
      return { ok: true };
    };
    await enqueue('attachment', { scope: 'thread:c1' });
    await enqueue('caption', { scope: 'thread:c2', dependencyIds: ['attachment'] });
    await settled('attachment');
    await flush();
    expect(op('attachment')?.status).toBe('failed_permanent');
    expect(op('caption')?.status).toBe('queued'); // waits
    expect(calls.map((c) => c.id)).toEqual(['attachment']);
    await discardOutbox('attachment');
    kickOutbox();
    await settled('caption');
    await flush();
    expect(op('caption')?.status).toBe('acknowledged');
  });

  it('a cached upload result is reused by the retry (bytes are never uploaded twice)', async () => {
    await open('client-a');
    let uploads = 0;
    registerOutboxHandler('message.send', async (o, ctx) => {
      if (!o.media?.attachment) {
        uploads += 1;
        await ctx.setMedia('attachment', { url: 'https://cdn/x.jpg' });
      }
      if ((attempts.get(o.operationId) ?? 0) === 0) {
        attempts.set(o.operationId, 1);
        throw networkError(); // send failed AFTER the upload
      }
      return { ok: true };
    });
    await enqueue('op-1');
    await settled('op-1');
    expect(op('op-1')?.media?.attachment?.url).toBe('https://cdn/x.jpg');
    await retryOutbox('op-1');
    await settled('op-1');
    await flush();
    expect(op('op-1')?.status).toBe('acknowledged');
    expect(uploads).toBe(1);
  });

  it('discarding an op in flight cancels it and removes it with its bytes', async () => {
    await open('client-a');
    await blobStore.put('outbox:op-1', new Blob(['x']));
    registerOutboxHandler('message.send', (_o, ctx) => new Promise((_r, reject) => ctx.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    await enqueue('op-1', { blobKeys: ['outbox:op-1'] });
    await flush();
    expect(op('op-1')?.status).toBe('sending');
    const removed = await discardOutbox('op-1');
    expect(removed?.operationId).toBe('op-1');
    expect(op('op-1')).toBeUndefined();
    expect(await blobStore.get('outbox:op-1')).toBeNull();
  });
});
