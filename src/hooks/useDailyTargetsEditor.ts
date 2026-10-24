import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import localforage from 'localforage';
import { getClientTargets, isTargetsConflict, updateClientTargets, type ClientTargets } from '@/services/platform/coachTargetsApi';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

/** The daily targets the cardio editor edits (O-11). */
export const MOVEMENT_FIELDS = ['steps', 'cardioMin'] as const;
export type MovementField = (typeof MOVEMENT_FIELDS)[number];
export type MovementTargets = Record<MovementField, number | null>;

interface StoredTargetsDraft {
  v: 1;
  values: MovementTargets;
  /** The server values the edit started from — sent as `expected` (per-field compare-and-set). */
  base: MovementTargets;
  savedAt: number;
}

const pick = (t: ClientTargets | null | undefined): MovementTargets => ({ steps: t?.steps ?? null, cardioMin: t?.cardioMin ?? null });
const same = (a: MovementTargets, b: MovementTargets) => MOVEMENT_FIELDS.every((k) => a[k] === b[k]);
const valid = (t: unknown): t is MovementTargets => !!t && typeof t === 'object' && MOVEMENT_FIELDS.every((k) => (t as Record<string, unknown>)[k] === null || typeof (t as Record<string, unknown>)[k] === 'number');

/**
 * Daily movement targets in the cardio editor (B3.5 owner review — B35-R2 / B35-R3).
 *
 *  - Edits are kept as a local draft per coach and client (`targetsDraft:<coach>:<client>`), like
 *    the plan's: navigating away, reload, browser Back and offline keep them.
 *  - A draft is restored with the values it was edited FROM. When the server changed since, it is
 *    reported as stale and saving it is refused by the server until the coach chooses — newer data
 *    is never overwritten automatically.
 *  - Save sends only the changed fields with the values they were edited from (`coachTargets.update`,
 *    per-field compare-and-set): a stale editor gets a conflict, never a silent overwrite; other
 *    targets (water, calories, protein) are untouched and never conflict.
 *  - A failed or conflicted save keeps the draft. A conflict shows the server's values: keep mine
 *    (retry from them) or use theirs.
 */
export function useDailyTargetsEditor({ clientId, coachId }: { clientId: string; coachId: string }) {
  const qc = useQueryClient();
  const draftKey = `targetsDraft:${coachId}:${clientId}`;
  const query = useQuery({ queryKey: ['coachTargets', clientId], queryFn: () => getClientTargets(clientId), enabled: !!clientId, refetchOnMount: 'always' });
  const [values, setValuesState] = useState<MovementTargets | null>(null);
  const [base, setBase] = useState<MovementTargets | null>(null);
  const [restored, setRestored] = useState(false);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState<MovementTargets | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !query.isSuccess || query.isFetching) return;
    startedRef.current = true;
    const server = pick(query.data);
    void draftStore.getItem<StoredTargetsDraft>(draftKey).then((d) => {
      if (d && d.v === 1 && valid(d.values) && valid(d.base) && !same(d.values, d.base)) {
        setValuesState(d.values);
        setBase(d.base);
        setRestored(true);
        setStale(!same(d.base, server));
      } else {
        setValuesState(server);
        setBase(server);
      }
    });
  }, [query.isSuccess, query.isFetching, query.data, draftKey]);

  const dirty = !!values && !!base && !same(values, base);

  useEffect(() => {
    if (values && base && dirty) void draftStore.setItem(draftKey, { v: 1, values, base, savedAt: Date.now() } satisfies StoredTargetsDraft);
  }, [values, base, dirty, draftKey]);

  const setValue = (k: MovementField, v: number | null) => setValuesState((cur) => (cur ? { ...cur, [k]: v } : cur));

  const clearDraft = useCallback(() => void draftStore.removeItem(draftKey), [draftKey]);

  /** Saves the changed fields; resolves to true when they landed. Never clears the draft on failure. */
  const save = async (from: MovementTargets | null = base): Promise<boolean> => {
    if (!values || !from) return true;
    const changed = MOVEMENT_FIELDS.filter((k) => values[k] !== from[k]);
    if (!changed.length) return true;
    setSaving(true);
    setFailed(false);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, values[k]]));
      const expected = Object.fromEntries(changed.map((k) => [k, from[k]]));
      const saved = await updateClientTargets(clientId, patch, expected);
      qc.setQueryData(['coachTargets', clientId], saved);
      const now = pick(saved);
      setBase(now);
      setValuesState(now);
      setConflict(null);
      setRestored(false);
      setStale(false);
      await draftStore.removeItem(draftKey);
      return true;
    } catch (e) {
      if (isTargetsConflict(e)) {
        // Show what is there now so the coach can review it; the draft and the edits stay.
        const latest = await qc.fetchQuery({ queryKey: ['coachTargets', clientId], queryFn: () => getClientTargets(clientId), staleTime: 0 }).catch(() => null);
        setConflict(pick(latest));
      } else {
        setFailed(true);
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Conflict: save my values over what is there now (the server still checks it is unchanged since). */
  const keepMine = async () => {
    if (!conflict) return false;
    const from = conflict;
    setBase(from);
    return save(from);
  };
  /** Conflict: take the server's values and drop my target edits. */
  const takeTheirs = async () => {
    if (!conflict) return;
    setBase(conflict);
    setValuesState(conflict);
    setConflict(null);
    setRestored(false);
    setStale(false);
    await draftStore.removeItem(draftKey);
  };
  /** Drop the unsaved target edits and show the server's values. */
  const discard = async () => {
    await draftStore.removeItem(draftKey);
    const server = pick(qc.getQueryData<ClientTargets | null>(['coachTargets', clientId]) ?? query.data);
    setBase(server);
    setValuesState(server);
    setConflict(null);
    setFailed(false);
    setRestored(false);
    setStale(false);
  };

  return {
    query,
    values,
    setValue,
    dirty,
    saving,
    failed,
    conflict,
    draftRestored: restored && dirty,
    draftStale: restored && dirty && stale,
    save,
    keepMine,
    takeTheirs,
    discard,
    clearDraft,
  };
}
