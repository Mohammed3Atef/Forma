import { apiGet, apiPut } from '@/services/platformApi';
import type { TFunction } from 'i18next';
import { writeAudit } from './auditApi';
import type { CoachPlanTierConfig } from '@/types';

/**
 * Admin-editable coach plan tiers (Layer A pricing/limits), backed by the
 * Mongo `coachPlanTiers` collection via `/api/plan-tiers/*` (was Firestore
 * `coachPlanTiers/{key}`). `GET /plan-tiers` already merges the always-present
 * built-in seed (trial/starter/pro/enterprise) with any Mongo overrides/customs
 * server-side (see `api/plan-tiers/_data.ts`), so this file no longer needs its
 * own seed/merge logic. `trial` is a protected built-in — don't archive it.
 */

const BASE = '/coach-plans/tiers';

/** Display label for a tier key: explicit label → built-in i18n → the key itself. */
export function tierLabel(tiers: CoachPlanTierConfig[], key: string | null | undefined, t: TFunction): string {
  if (!key || key === 'none') return t('adminCoaches.tier.none', { defaultValue: '—' });
  const cfg = tiers.find((x) => x.key === key);
  if (cfg?.label) return cfg.label;
  return t(`adminCoaches.tier.${key}`, { defaultValue: key });
}

/** Built-in seed + Mongo overrides/customs (server-merged). Sorted by order. */
export async function listCoachPlanTiers(includeArchived = false): Promise<CoachPlanTierConfig[]> {
  return apiGet<CoachPlanTierConfig[]>(`${BASE}${includeArchived ? '?includeArchived=1' : ''}`);
}

export async function getCoachPlanTier(key: string): Promise<CoachPlanTierConfig | null> {
  const tiers = await listCoachPlanTiers(true);
  return tiers.find((tr) => tr.key === key) ?? null;
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
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!key) throw new Error('A tier key is required.');
  await apiPut(`${BASE}/${encodeURIComponent(key)}`, {
    label: (input.label ?? '').trim(),
    maxClients: Math.max(0, Math.floor(input.maxClients || 0)),
    priceMonthly: Math.max(0, Math.round(input.priceMonthly || 0)),
    currency: input.currency?.trim() || 'EGP',
    order: input.order,
    active: input.active ?? true,
  });
  await writeAudit({ action: 'coachPlanTier.save', targetUserId: key, metadata: { key } });
}

/**
 * Super-admin: archive (soft-delete) a tier. `trial` is protected.
 * `PUT /plan-tiers/:tierKey` is a full replace (`maxClients`/`priceMonthly`
 * are required by its body schema), so this reads the current config first
 * to preserve its existing fields rather than clobbering them with defaults.
 */
export async function archiveCoachPlanTier(key: string): Promise<void> {
  if (key === 'trial') throw new Error('The trial tier cannot be removed.');
  const current = await getCoachPlanTier(key);
  await apiPut(`${BASE}/${encodeURIComponent(key)}`, {
    label: current?.label ?? '',
    maxClients: current?.maxClients ?? 0,
    priceMonthly: current?.priceMonthly ?? 0,
    currency: current?.currency ?? 'EGP',
    order: current?.order,
    active: false,
    archived: true,
  });
  await writeAudit({ action: 'coachPlanTier.archive', targetUserId: key, metadata: { key } });
}
