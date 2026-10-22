import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure, roleProcedureNoActive } from '../trpc.js';
import { correctPayment, listPayments, recordPayment, reversePayment, type PaymentActor } from '../../payments/_service.js';
import { PAYMENT_METHODS } from '../../payments/_types.js';

/**
 * B3.8 (owner decision 1) — manually recorded client payments. Coaches record what they say they
 * received (cash / mobile wallet / InstaPay); Forma verifies nothing. Records are never edited or
 * deleted — mistakes are reversed, or corrected (reversal + new payment). Clients do not read this.
 */
const Method = z.enum(PAYMENT_METHODS as [string, ...string[]]);
const RequestId = z.string().trim().min(8).max(100);
/** Up to EGP 10,000,000 in piastres; whole piastres only. */
const AmountMinor = z.number().int().positive().max(1_000_000_000);
const Entry = {
  amountMinor: AmountMinor,
  method: Method,
  paidAt: z.number().int(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  termId: z.union([z.literal('current'), z.string().trim().min(1).max(64)]).nullable(),
};

const actorOf = (user: { id: string }): PaymentActor => ({ id: user.id, role: 'coach' });

export const clientPaymentsRouter = router({
  /**
   * The coach's own records (one client, or all), newest first. B3.8 final (owner, B38F-R2): a
   * coach's client-payment records are private to that coach — no permission (`users.read` or any
   * other), role or admin grant reads another coach's ledger; `coachId`, if sent, must be the caller.
   * Forma's own billing (plans, requests, add-ons) is separate and unaffected.
   */
  list: roleProcedureNoActive('coach')
    .input(z.object({ coachId: z.string().trim().min(1).optional(), clientId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      if (input.coachId !== undefined && input.coachId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      return listPayments(ctx.user.id, input.clientId);
    }),

  record: roleProcedure('coach')
    .input(z.object({ clientId: z.string().trim().min(1), ...Entry, requestId: RequestId }))
    .mutation(async ({ ctx, input }) => {
      const { requestId, ...entry } = input;
      return recordPayment(actorOf(ctx.user), entry as Parameters<typeof recordPayment>[1], requestId);
    }),

  reverse: roleProcedure('coach')
    .input(z.object({ paymentId: z.string().trim().min(1).max(64), reason: z.string().trim().min(1).max(300), requestId: RequestId }))
    .mutation(async ({ ctx, input }) => reversePayment(actorOf(ctx.user), input.paymentId, input.reason, input.requestId)),

  correct: roleProcedure('coach')
    .input(z.object({ paymentId: z.string().trim().min(1).max(64), reason: z.string().trim().min(1).max(300), ...Entry, requestId: RequestId }))
    .mutation(async ({ ctx, input }) => {
      const { paymentId, reason, requestId, ...entry } = input;
      return correctPayment(actorOf(ctx.user), paymentId, entry as Parameters<typeof correctPayment>[2], reason, requestId);
    }),
});
