import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { TFunction } from 'i18next';
import { writeAudit } from './auditApi';
import { COACH_PLAN_TIERS } from './coachPlanApi';
import type { CoachPlanTierConfig } from '@/types';

/**
 * Admin-editable coach plan tiers (Layer A pricing/limits), at `coachPlanTiers/{key}`.
 * The built-in tiers in COACH_PLAN_TIERS are the always-present SEED/fallback: the
 * list below merges those defaults with any Firestore overrides/custom tiers, so the
 * app works before anything is written and stays editable afterwards. `trial` is a
 * protected built-in (cap mirrors firestore.rules — don't archive it).
 */

const COL = 'coachPlanTiers';
const SEED_ORDER: Record<string, number> = { trial: 0, starter: 1, pro: 2, enterprise: 3 };

/** Built-in tiers as configs (label empty → UI falls back to i18n `adminCoaches.tier.<key>`). */
function seedTiers(): CoachPlanTierConfig[] {
  return Object.keys(COACH_PLAN_TIERS).map((key) => ({
    key,
    label: '',
    maxClients: COACH_PLAN_TIERS[key]?.maxClients ?? 0,
    priceMonthly: COACH_PLAN_TIERS[key]?.priceMonthly ?? 0,
    currency: 'EGP',
    order: SEED_ORDER[key] ?? 99,
    active: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  }));
}

/** Display label for a tier key: explicit label → built-in i18n → the key itself. */
export function tierLabel(tiers: CoachPlanTierConfig[], key: string | null | undefined, t: TFunction): string {
  if (!key || key === 'none') return t('adminCoaches.tier.none', { defaultValue: '—' });
  const cfg = tiers.find((x) => x.key === key);
  if (cfg?.label) return cfg.label;
  return t(`adminCoaches.tier.${key}`, { defaultValue: key });
}

/** Built-in seed + Firestore overrides/customs (Firestore wins per key). Sorted by order. */
export async function listCoachPlanTiers(includeArchived = false): Promise<CoachPlanTierConfig[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, COL)).catch(() => null);
  const map = new Map<string, CoachPlanTierConfig>();
  for (const t of seedTiers()) map.set(t.key, t);
  if (snap) for (const d of snap.docs) map.set(d.id, { ...(d.data() as CoachPlanTierConfig), key: d.id });
  let list = [...map.values()];
  if (!includeArchived) list = list.filter((tr) => !tr.archived);
  return list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.key.localeCompare(b.key));
}

export async function getCoachPlanTier(key: string): Promise<CoachPlanTierConfig | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, COL, key)).catch(() => null);
  if (snap?.exists()) return { ...(snap.data() as CoachPlanTierConfig), key };
  return seedTiers().find((tr) => tr.key === key) ?? null;
}

/** Super-admin: create or update a tier (deterministic doc id = key). */
export async function saveCoachPlanTier(input: {
  key: string;
  label?: string;
  maxClients: number;
  priceMonthly: number;
  currency?: string;
  order?: number;
  active?: boolean;
}): Promise<void> {
  const { db } = ensureFirebase();
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!key) throw new Error('A tier key is required.');
  const now = Date.now();
  const prev = await getDoc(doc(db, COL, key)).catch(() => null);
  await setDoc(
    doc(db, COL, key),
    {
      key,
      label: (input.label ?? '').trim(),
      maxClients: Math.max(0, Math.floor(input.maxClients || 0)),
      priceMonthly: Math.max(0, Math.round(input.priceMonthly || 0)),
      currency: input.currency?.trim() || 'EGP',
      order: input.order ?? SEED_ORDER[key] ?? 99,
      active: input.active ?? true,
      archived: false,
      builtIn: key in COACH_PLAN_TIERS,
      createdAt: prev?.exists() ? (prev.data() as CoachPlanTierConfig).createdAt || now : now,
      updatedAt: now,
    },
    { merge: true },
  );
  await writeAudit({ action: 'coachPlanTier.save', targetUserId: key, metadata: { key } });
}

/** Super-admin: archive (soft-delete) a tier. `trial` is protected. */
export async function archiveCoachPlanTier(key: string): Promise<void> {
  if (key === 'trial') throw new Error('The trial tier cannot be removed.');
  const { db } = ensureFirebase();
  await setDoc(doc(db, COL, key), { key, archived: true, active: false, updatedAt: Date.now() }, { merge: true });
  await writeAudit({ action: 'coachPlanTier.archive', targetUserId: key, metadata: { key } });
}
