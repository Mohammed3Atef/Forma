import { trpc } from '@/services/trpc';
import type { ClientPayment, PaymentMethod } from '@/types';

/**
 * B3.8 (owner decision 1) — manually recorded client payments. Each save carries a `requestId`
 * (one per sheet opening) so a retry after a lost response, or a double click, records once.
 * Anything that changes payments invalidates `['coachPayments', coachId]`.
 */

type ApiDoc = Omit<ClientPayment, 'id'> & { _id: string };
const fromApiDoc = ({ _id, ...rest }: ApiDoc): ClientPayment => ({ id: _id, ...rest });

/**
 * One client's ledger (B3.9, B38F-R7 / PF-14): the workspace Payments card reads only this client's
 * records — server-filtered — instead of the coach's whole ledger. Under the `['coachPayments', coachId]`
 * prefix, so every write's invalidation still reaches it.
 */
export function clientPaymentsQuery(coachId: string | undefined, clientId: string) {
  return {
    queryKey: ['coachPayments', coachId, clientId] as const,
    queryFn: async (): Promise<ClientPayment[]> => (await trpc.clientPayments.list.query({ coachId: coachId!, clientId })).map((d) => fromApiDoc(d as ApiDoc)),
    enabled: !!coachId && !!clientId,
    staleTime: 60_000,
  };
}

export function coachPaymentsQuery(coachId: string | undefined) {
  return {
    queryKey: ['coachPayments', coachId] as const,
    queryFn: async (): Promise<ClientPayment[]> => (await trpc.clientPayments.list.query({ coachId: coachId! })).map((d) => fromApiDoc(d as ApiDoc)),
    enabled: !!coachId,
    staleTime: 60_000,
  };
}

export interface PaymentInput {
  /** A term id, `'current'`, or null (not tied to a package). */
  termId: string | 'current' | null;
  amountMinor: number;
  method: PaymentMethod;
  paidAt: number;
  reference?: string;
  note?: string;
}

const clean = (i: PaymentInput) => ({
  termId: i.termId,
  amountMinor: i.amountMinor,
  method: i.method,
  paidAt: i.paidAt,
  ...(i.reference?.trim() ? { reference: i.reference.trim() } : {}),
  ...(i.note?.trim() ? { note: i.note.trim() } : {}),
});

export async function recordPayment(clientId: string, input: PaymentInput, requestId: string): Promise<ClientPayment> {
  return fromApiDoc((await trpc.clientPayments.record.mutate({ clientId, ...clean(input), requestId })) as ApiDoc);
}

export async function reversePayment(paymentId: string, reason: string, requestId: string): Promise<ClientPayment> {
  return fromApiDoc((await trpc.clientPayments.reverse.mutate({ paymentId, reason: reason.trim(), requestId })) as ApiDoc);
}

export async function correctPayment(paymentId: string, input: PaymentInput, reason: string, requestId: string): Promise<ClientPayment> {
  return fromApiDoc((await trpc.clientPayments.correct.mutate({ paymentId, reason: reason.trim(), ...clean(input), requestId })) as ApiDoc);
}
