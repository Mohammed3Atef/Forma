import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import localforage from 'localforage';
import { pickFreshDraft } from '@/lib/draft';
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
}

export function usePlanEditor<T extends { updatedAt?: number }>(o: Options<T>) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [o.queryKey, o.clientId], queryFn: () => o.load(o.clientId), enabled: !!o.clientId });
  const [plan, setPlanState] = useState<T | null>(null);
  // undefined = no base established yet (never savable); null = creating; number = server revision.
  const [base, setBase] = useState<number | null | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const baselineRef = useRef('');
  const savedTimer = useRef<number | undefined>(undefined);
  const startedRef = useRef(false);

  // Initialise ONLY from a successful read. A failed or paused read leaves the
  // editor closed (status error/offline) — it can never fall back to empty.
  useEffect(() => {
    if (startedRef.current || !query.isSuccess) return;
    startedRef.current = true;
    const server = (query.data ?? null) as T | null;
    void draftStore.getItem<T>(o.draftKey).then((draft) => {
      if (server) {
        baselineRef.current = JSON.stringify(server);
        setBase(server.updatedAt ?? 0);
        setPlanState(pickFreshDraft(draft, server) ?? server);
      } else if (draft) {
        // A draft for a plan that doesn't exist on the server: resume creating it.
        baselineRef.current = '';
        setBase(null);
        setPlanState(draft);
      }
      setInitialized(true);
    });
  }, [query.isSuccess, query.data, o.draftKey]);

  const status: PlanEditorStatus = plan
    ? 'ready'
    : query.isError
      ? 'error'
      : query.isSuccess
        ? initialized
          ? 'empty'
          : 'loading'
        : query.fetchStatus === 'paused'
          ? 'offline'
          : 'loading';

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;

  useEffect(() => {
    if (plan && dirty) void draftStore.setItem(o.draftKey, plan);
  }, [plan, dirty, o.draftKey]);

  const setPlan = (next: T | ((cur: T) => T)) =>
    setPlanState((cur) => (cur === null ? cur : typeof next === 'function' ? (next as (c: T) => T)(cur) : next));

  const save = useMutation({
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
      const saved = await o.save(o.clientId, submitted, { baseUpdatedAt: b, versionReason: opts?.reason });
      return { saved, submitted };
    },
    onSuccess: async ({ saved, submitted }) => {
      await draftStore.removeItem(o.draftKey);
      baselineRef.current = JSON.stringify(saved);
      setBase(saved.updatedAt ?? 0);
      // Keep edits made while the request was in flight (they stay "unsaved").
      setPlanState((cur) => (cur === submitted || cur === null ? saved : { ...cur, updatedAt: saved.updatedAt }));
      setConflict(false);
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
    const p = o.empty();
    baselineRef.current = JSON.stringify(p);
    setBase(null);
    setPlanState(p);
  };

  const reloadLatest = async () => {
    const latest = (await qc.fetchQuery({ queryKey: [o.queryKey, o.clientId], queryFn: () => o.load(o.clientId), staleTime: 0 })) as T | null;
    await draftStore.removeItem(o.draftKey);
    setConflict(false);
    save.reset();
    if (latest) {
      baselineRef.current = JSON.stringify(latest);
      setBase(latest.updatedAt ?? 0);
      setPlanState(latest);
    } else {
      baselineRef.current = '';
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
    startNew,
    retry: () => void query.refetch(),
    reloadLatest,
    discardDraft,
  };
}
