import type { TransferMode, TransferSubHandling } from '../coach-clients/_types';

export type TransferRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

/**
 * Local (Mongo-era) mirror of `ClientTransferRequest` from `src/types/index.ts`.
 * `_id` == `${toCoachId}__${clientId}` (deterministic composite id, matching
 * the Firestore `transferRequests/{toCoachId__clientId}` doc-id convention).
 */
export interface ClientTransferRequestDoc {
  _id: string;
  clientId: string;
  fromCoachId: string; // current coach
  toCoachId: string; // requesting (prospective) coach
  mode?: TransferMode;
  subscriptionHandling?: TransferSubHandling;
  reason: string;
  status: TransferRequestStatus;
  requestedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  adminNote?: string;
  updatedAt: number;
}
