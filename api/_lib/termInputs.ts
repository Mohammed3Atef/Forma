import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { CommercialReason } from './commercialReason.js';
import { isDateKey, isTimeZone } from './civilDate.js';

/**
 * B3.8 — input pieces shared by every procedure that creates or changes a client term or a
 * payment (coach clients, invites, transfers, payments).
 *
 * EGP-only (owner decision 8): Forma's client packages, terms, renewals and payments are in
 * Egyptian pounds. A caller may still send a currency (apps older than B3.8 always did); it must
 * be EGP. Anything else is REFUSED (`UNSUPPORTED_CURRENCY`) — never stored, and never silently
 * relabelled, which would turn "50 USD" into "50 EGP".
 */
export const SUPPORTED_CURRENCY = 'EGP';

export function assertSupportedCurrency(currency: string | null | undefined): void {
  if (currency == null || currency.trim() === '' || currency.trim().toUpperCase() === SUPPORTED_CURRENCY) return;
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only Egyptian pounds (EGP) are supported', cause: new CommercialReason('UNSUPPORTED_CURRENCY') });
}

/** A calendar date `YYYY-MM-DD` that exists (no 30 February). */
export const DateKeySchema = z.string().trim().refine(isDateKey, { message: 'Expected a calendar date (YYYY-MM-DD)' });

/** An IANA time zone this server knows, e.g. `Africa/Cairo` (the coach device's zone). */
export const TimeZoneSchema = z.string().trim().max(64).refine(isTimeZone, { message: 'Unknown time zone' });

/** A currency field kept for older apps; checked with `assertSupportedCurrency`. */
export const CurrencyInputSchema = z.string().trim().max(10).optional();

/**
 * A package price in EGP (major units, as stored on terms): non-negative, at most two decimals
 * (piastres), bounded. Payments are stored in minor units (`clientPayments`).
 */
export const PriceSchema = z
  .number()
  .nonnegative()
  .max(10_000_000)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, { message: 'At most two decimals' });

/** Term lengths: whole days / months, bounded (ten years). */
export const TermDaysSchema = z.number().int().positive().max(3660);
export const TermMonthsSchema = z.number().int().positive().max(120);
