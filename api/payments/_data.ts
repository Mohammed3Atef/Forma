import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import type { ClientPaymentDoc, PaymentTermLockDoc } from './_types.js';

/**
 * B3.8 — the manual payment ledger's collections. Indexes are ensured on every call (not
 * memoised: the test suites drop the database between cases — see `api/coach-assets/_lib/db.ts`)
 * and are also declared in `scripts/mongo-init-indexes.mjs`.
 */
export async function clientPaymentsCol(): Promise<Collection<ClientPaymentDoc>> {
  const col = (await getDb()).collection<ClientPaymentDoc>('clientPayments');
  // A retried / double-clicked save records once.
  await col.createIndex({ coachId: 1, requestId: 1 }, { unique: true, name: 'uniq_coach_request' });
  // A payment is reversed at most once — even by two racing requests.
  await col.createIndex({ reversesId: 1 }, { unique: true, partialFilterExpression: { reversesId: { $type: 'string' } }, name: 'uniq_reverses' });
  await col.createIndex({ coachId: 1, paidAt: -1 }, { name: 'coachId_paidAt' });
  await col.createIndex({ relationshipId: 1, termId: 1 }, { name: 'relationshipId_termId' });
  return col;
}

export async function paymentTermLocksCol(): Promise<Collection<PaymentTermLockDoc>> {
  return (await getDb()).collection<PaymentTermLockDoc>('clientPaymentTermLocks');
}
