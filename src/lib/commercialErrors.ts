import type { TFunction } from 'i18next';
import { errorMessage } from '@/lib/errorMessage';

/**
 * Human message for a commercial refusal, chosen by the server's machine
 * reason (`error.data.reason`) rather than by parsing English text — so
 * SUBSCRIPTION_EXPIRED and CLIENT_CAPACITY_REACHED read differently in every
 * language. B3.9 (TS-02): with no known reason it falls back to the shared,
 * translated `errorMessage` — never the server's English text.
 */
export function commercialErrorMessage(e: unknown, t: TFunction): string {
  return errorMessage(e, t);
}
