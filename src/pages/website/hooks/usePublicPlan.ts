import { useQuery } from '@tanstack/react-query';
import { getPublicForma } from '@/services/platform/coachPlanTiersApi';
import type { PublicFormaPlan } from '@/types';

/**
 * The public Forma plan behind the pricing card and the hero's trial line.
 * `undefined` while loading, `null` when the Super Admin hides Forma from the
 * public site (or the request fails) — the pricing section then disappears.
 */
export function usePublicPlan(): PublicFormaPlan | null | undefined {
  const q = useQuery({ queryKey: ['publicForma'], queryFn: getPublicForma, staleTime: 300_000 });
  if (q.isError) return null;
  return q.data;
}
