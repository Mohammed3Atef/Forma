import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import localforage from 'localforage';
import { isPlanConflict, type PlanSaveOptions } from '@/services/platform/planApi';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

/**
 * Editor lifecycle for a coach-authored client plan (B0 / CO-01).
 *
 *  loading → the plan request is in flight
 *  offline → the request is paused (no network) and nothing is cached
 *  error   → the request failed (after React Query's retry)
 *  empty   → the server answered "no plan yet"; creating one is a deliberate action
 *  ready   → a real, loaded plan (or a deliberately started new one) is being edited
 *
 * An unloaded plan never becomes an editable empty plan: the editor only gets
 * a `plan` after a successful read, and every save carries the `updatedAt` it
 * was based on (`null` when creating) so the server rejects stale overwrites
 * with CONFLICT. Local drafts survive navigation and are only restored when
 * the server copy hasn't changed since (see lib/draft.ts).
 *
 * B3.5:
 *  - `normalize` gives the editor its working shape BEFORE the baseline is taken, so opening a
 *    plan never makes it "unsaved" (B34-R1); `serialize` turns it back into the stored shape on save.
 *  - The editor opens on a fresh read (a cached copy is refetched first), so it starts from the
 *    server's latest revision whenever it is online.
 *  - A restored draft is reported (`draftRestored`) and can be dropped (`revertToSaved`).
 *  - A save attempted offline fails at once (instead of waiting as "Saving…"); the work stays in the draft.
 *  - Owner review (B35-R3): a draft records the revision it was edited from. A draft made before the
 *    plan changed elsewhere is no longer dropped: it is restored ON ITS OWN base revision and
 *    reported as stale (`draftStale`), so saving it hits the server's compare-and-set (conflict:
 *    keep mine / load latest) — newer server data is never overwritten automatically and the
 *    coach's work is never silently lost. Older drafts (a bare plan) are read as before.
 */
export type PlanEditorStatus = 'loading' | 'offline' | 'error' | 'empty' | 'ready';

interface Options<T> {
  queryKey: string;
  clientId: string;
  /** Per-coach draft key, so two accounts on one device never share drafts. */
  draftKey: string;
  load: (clientId: string) => Promise<T | null>;
  save: (clientId: string, plan: T, opts: PlanSaveOptions) => Promise<T>;
  empty: () => T;
  /** Working shape for editing (idempotent; never persisted on its own). */
  normalize?: (plan: T) => T;
  /** Stored shape, applied to what is sent on save. */
  serialize?: (plan: T) => T;
}

const same = <T,>(p: T) => p;

/** What the editor keeps on the device: the working copy and the revision it was edited from. */
interface StoredDraft<T> {
  v: 2;
  plan: T;
  /** `null` = creating (no plan existed); a number = the server's `updatedAt` it was edited from. */
  base: number | null;
  savedAt: number;
}
/** Reads both draft shapes: B3.5's `{ v: 2, plan, base }` and the older bare plan (edited from its own `updatedAt`). */
function readDraft<T extends { updatedAt?: number }>(stored: unknown, serverExists: boolean): { plan: T; base: number | null } | null {
  if (!stored || typeof stored !== 'object') return null;
  const d = stored as Partial<StoredDraft<T>>;
  if (d.v === 2 && d.plan) return { plan: d.plan, base: d.base ?? null };
  const legacy = stored as T;
  return { plan: legacy, base: serverExists && typeof legacy.updatedAt === 'number' ? legacy.updatedAt : null };
}

export function usePlanEditor<T extends { updatedAt?: number }>(o: Options<T>) {
  const qc = useQueryClient();
  const normalize = o.normalize ?? same;
  const serialize = o.serialize ?? same;
  const query = useQuery({ queryKey: [o.queryKey, o.clientId], queryFn: () => o.load(o.clientId), enabled: !!o.clientId, refetchOnMount: 'always' });
  const [plan, setPlanState] = useState<T | null>(null);
  // undefined = no base established yet (never savable); null = creating; number = server revision.
  const [base, setBase] = useState<number | null | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftStale, setDraftStale] = useState(false);
  const baselineRef = useRef('');
  const savedTimer = useRef<number | undefined>(undefined);
  const startedRef = useRef(false);

  // Initialise ONLY from a successful read — the fresh one when a cached copy is being refetched.
  // A failed or paused read leaves the editor closed (status error/offline) — never an empty plan.
  useEffect(() => {
    if (startedRef.current || !query.isSuccess || query.isFetching) return;
    startedRef.current = true;
    const server = query.data ? normalize(query.data as T) : null;
    void draftStore.getItem<unknown>(o.draftKey).then((stored) => {
      const read = readDraft<T>(stored, !!server);
      const draft = read ? { plan: normalize(read.plan), base: read.base } : null;
      const serverBase = server ? server.updatedAt ?? 0 : null;
      baselineRef.current = server ? JSON.stringify(server) : '';
      if (draft && JSON.stringify(draft.plan) !== baselineRef.current) {
        // The coach's unsaved work comes back on the revision it was edited from. When the plan has
        // changed since (another device, a restore, a template), that base is stale: saving it is
        // refused by the server until the coach chooses (keep mine / load latest).
        setBase(draft.base);
        setPlanState(draft.plan);
        setDraftRestored(true);
        setDraftStale(draft.base !== serverBase);
      } else if (server) {
        setBase(serverBase);
        setPlanState(server);
      }
      setInitialized(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, query.isFetching, query.data, o.draftKey]);

  const status: PlanEditorStatus = plan
    ? 'ready'
    : query.isError
      ? 'error'
      : query.isSuccess && !query.isFetching
        ? initialized
          ? 'empty'
          : 'loading'
        : query.fetchStatus === 'paused'
          ? 'offline'
          : 'loading';

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;

  useEffect(() => {
    if (plan && dirty && base !== undefined) void draftStore.setItem(o.draftKey, { v: 2, plan, base, savedAt: Date.now() } satisfies StoredDraft<T>);
  }, [plan, dirty, base, o.draftKey]);

  const setPlan = (next: T | ((cur: T) => T)) =>
    setPlanState((cur) => (cur === null ? cur : typeof next === 'function' ? (next as (c: T) => T)(cur) : next));

  const save = useMutation({
    // Fail fast offline (React Query would otherwise hold the mutation as pending until reconnect).
    networkMode: 'always',
    mutationFn: async (opts?: { reason?: string; overwrite?: boolean }) => {
      if (!plan || base === undefined) throw new Error('PLAN_NOT_LOADED');
      let b: number | null = base;
      if (opts?.overwrite) {
        // "Save my version anyway": re-read the current revision; the server
        // still snapshots the version being replaced, so it stays restorable.
        const latest = await o.load(o.clientId);
        b = latest ? latest.updatedAt ?? 0 : null;
      }
      const submitted = plan;
      const saved = await o.save(o.clientId, serialize(submitted), { baseUpdatedAt: b, versionReason: opts?.reason });
      return { saved, submitted };
    },
    onSuccess: async ({ saved, submitted }) => {
      await draftStore.removeItem(o.draftKey);
      const working = normalize(saved);
      baselineRef.current = JSON.stringify(working);
      setBase(saved.updatedAt ?? 0);
      // Keep edits made while the request was in flight (they stay "unsaved").
      setPlanState((cur) => (cur === submitted || cur === null ? working : { ...cur, updatedAt: saved.updatedAt }));
      setConflict(false);
      setDraftRestored(false);
      setDraftStale(false);
      qc.setQueryData([o.queryKey, o.clientId], saved);
      void qc.invalidateQueries({ queryKey: ['planVersions', o.clientId] });
      window.clearTimeout(savedTimer.current);
      setJustSaved(true);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 3000);
    },
    onError: (e) => {
      if (isPlanConflict(e)) setConflict(true);
    },
  });

  const startNew = () => {
    const p = normalize(o.empty());
    baselineRef.current = JSON.stringify(p);
    setBase(null);
    setPlanState(p);
  };

  const reloadLatest = async () => {
    const latest = (await qc.fetchQuery({ queryKey: [o.queryKey, o.clientId], queryFn: () => o.load(o.clientId), staleTime: 0 })) as T | null;
    await draftStore.removeItem(o.draftKey);
    setConflict(false);
    setDraftRestored(false);
    setDraftStale(false);
    save.reset();
    if (latest) {
      const working = normalize(latest);
      baselineRef.current = JSON.stringify(working);
      setBase(latest.updatedAt ?? 0);
      setPlanState(working);
    } else {
      baselineRef.current = '';
      setBase(undefined);
      setPlanState(null);
    }
  };

  /** Drop the unsaved changes (the restored draft or this session's edits) and show the saved plan again. */
  const revertToSaved = async () => {
    await draftStore.removeItem(o.draftKey);
    setDraftRestored(false);
    setDraftStale(false);
    setConflict(false);
    save.reset();
    if (baselineRef.current) {
      const saved = JSON.parse(baselineRef.current) as T;
      setBase(saved.updatedAt ?? 0);
      setPlanState(saved);
    } else {
      // Nothing saved yet: back to "no plan yet".
      setBase(undefined);
      setPlanState(null);
    }
  };

  const discardDraft = () => void draftStore.removeItem(o.draftKey);

  return {
    query,
    status,
    plan,
    setPlan,
    dirty,
    creating: base === null,
    canSave: !!plan && base !== undefined && !save.isPending,
    save,
    conflict,
    justSaved,
    draftRestored: draftRestored && dirty,
    /** The restored draft was made before the plan changed elsewhere (saving will ask first). */
    draftStale: draftRestored && dirty && draftStale,
    startNew,
    retry: () => void query.refetch(),
    reloadLatest,
    revertToSaved,
    discardDraft,
  };
}

export type PlanEditor<T extends { updatedAt?: number }> = ReturnType<typeof usePlanEditor<T>>;
