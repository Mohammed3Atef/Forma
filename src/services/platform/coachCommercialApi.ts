import { trpc } from '@/services/trpc';
import type { AdminCoachCommercial, CapacityEntitlement, CapacityPackage, CoachCommercialOverview, CoachPlan, CoachPlanRequest, LocalizedText } from '@/types';

/**
 * Client-capacity add-ons + Super Admin commercial actions (`coachCommercial.*`).
 * Capacity packages are INTERNAL — only the coach's own My Plan and Super
 * Admin screens use this; nothing here is ever called from a public page.
 */

/** Coach My Plan — subscription, capacity, add-ons, offers and requests in one call. */
export async function getMyCommercialOverview(): Promise<CoachCommercialOverview> {
  return trpc.coachCommercial.myOverview.query();
}

// ---- Super Admin: catalogue ----

export async function listCapacityPackages(includeArchived = false): Promise<CapacityPackage[]> {
  return trpc.coachCommercial.listPackages.query({ includeArchived });
}

export interface CapacityPackageInput {
  id?: string;
  name: LocalizedText;
  description?: LocalizedText;
  badge?: LocalizedText;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  durationMonths?: number;
  active: boolean;
  coachVisible: boolean;
  promotional?: boolean;
  sortOrder?: number;
  validFrom?: number | null;
  validUntil?: number | null;
  targetCoachIds?: string[];
}

export async function saveCapacityPackage(input: CapacityPackageInput): Promise<CapacityPackage> {
  const lt = (v?: LocalizedText) => (v && (v.en.trim() || v.ar.trim()) ? { en: v.en.trim(), ar: v.ar.trim() || v.en.trim() } : undefined);
  return trpc.coachCommercial.savePackage.mutate({ ...input, name: lt(input.name)!, description: lt(input.description), badge: lt(input.badge) });
}

export async function setCapacityPackageState(id: string, patch: { active?: boolean; archived?: boolean }): Promise<CapacityPackage> {
  return trpc.coachCommercial.setPackageState.mutate({ id, ...patch });
}

export async function reorderCapacityPackages(ids: string[]): Promise<void> {
  await trpc.coachCommercial.reorderPackages.mutate({ ids });
}

// ---- Super Admin: per coach ----

export async function getAdminCoachCommercial(coachId: string): Promise<AdminCoachCommercial> {
  return trpc.coachCommercial.adminCoachOverview.query({ coachId });
}

export interface CapacityChange {
  entitlement: CapacityEntitlement;
  before: number;
  after: number;
}

export async function grantCapacityPackage(coachId: string, packageId: string, note?: string): Promise<CapacityChange & { renewed: boolean }> {
  return trpc.coachCommercial.grantPackage.mutate({ coachId, packageId, note });
}

export async function grantCustomCapacity(input: {
  coachId: string;
  name?: LocalizedText;
  additionalClients: number;
  price?: number;
  currency?: string;
  billingInterval: 'month' | 'one_time';
  durationMonths?: number;
  note: string;
}): Promise<CapacityChange> {
  return trpc.coachCommercial.grantCustom.mutate(input);
}

export async function cancelCapacityEntitlement(entitlementId: string, reason?: string): Promise<CapacityChange & { activeClients: number }> {
  return trpc.coachCommercial.cancelEntitlement.mutate({ entitlementId, reason });
}

export async function setManualCapacityAdjustment(coachId: string, value: number, reason: string): Promise<{ before: number | null; after: number }> {
  return trpc.coachCommercial.setManualAdjustment.mutate({ coachId, value, reason });
}

/** Super Admin "Renew Forma" / record payment — confirms the open subscription request or records one. */
export async function renewCoachSubscription(coachId: string, note?: string): Promise<{ request: CoachPlanRequest; plan: CoachPlan | null }> {
  return trpc.coachCommercial.renewSubscription.mutate({ coachId, note });
}
