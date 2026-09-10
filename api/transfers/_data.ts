import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import type { ClientTransferRequestDoc } from './_types.js';

export async function transfersCol(): Promise<Collection<ClientTransferRequestDoc>> {
  return (await getDb()).collection<ClientTransferRequestDoc>('transferRequests');
}

/** Deterministic id — mirrors the Firestore `transferRequests/{toCoachId__clientId}` convention. */
export function transferReqId(toCoachId: string, clientId: string): string {
  return `${toCoachId}__${clientId}`;
}
