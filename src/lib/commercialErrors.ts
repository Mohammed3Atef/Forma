import type { TFunction } from 'i18next';
import { TRPCClientError } from '@/services/trpc';
import { commercialReason } from '@/services/platform/coachPlanRequestsApi';

/**
 * Human message for a commercial refusal, chosen by the server's machine
 * reason (`error.data.reason`) rather than by parsing English text — so
 * SUBSCRIPTION_EXPIRED and CLIENT_CAPACITY_REACHED read differently in every
 * language. Falls back to the server message, then a generic error.
 */
export function commercialErrorMessage(e: unknown, t: TFunction): string {
  const reason = commercialReason(e);
  if (reason) {
    const key = `forma.reason.${reason}`;
    const msg = t(key, { defaultValue: '' });
    if (msg) return msg;
  }
  return e instanceof TRPCClientError && e.message ? e.message : t('common.errorGeneric');
}
