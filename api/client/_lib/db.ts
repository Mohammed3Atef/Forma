import type { Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import type {
  AppNotificationDoc,
  ArchivedClientDataDoc,
  ClientPlanDoc,
  ClientProfileDoc,
  ClientSettingsDoc,
  CoachNoteDoc,
  CoachTargetsDoc,
  FreezeRequestDoc,
  MeasurementLogDoc,
  PlanVersionDoc,
  WeeklyCheckInDoc,
} from './types.js';

/** Coach⇄client relationship doc, built by a parallel agent this same session. */
export interface CoachClientRelDoc {
  _id: string; // `${coachId}__${clientId}`
  coachId: string;
  clientId: string;
  status: 'active' | 'pending' | 'ended';
  [key: string]: unknown;
}

export async function coachClientsCol(): Promise<Collection<CoachClientRelDoc>> {
  return (await getDb()).collection<CoachClientRelDoc>('coachClients');
}

export async function clientProfilesCol(): Promise<Collection<ClientProfileDoc>> {
  return (await getDb()).collection<ClientProfileDoc>('clientProfiles');
}

export async function clientSettingsCol(): Promise<Collection<ClientSettingsDoc>> {
  return (await getDb()).collection<ClientSettingsDoc>('clientSettings');
}

export async function clientWorkoutPlansCol(): Promise<Collection<ClientPlanDoc>> {
  return (await getDb()).collection<ClientPlanDoc>('clientWorkoutPlans');
}

export async function clientNutritionPlansCol(): Promise<Collection<ClientPlanDoc>> {
  return (await getDb()).collection<ClientPlanDoc>('clientNutritionPlans');
}

export async function clientCardioPlansCol(): Promise<Collection<ClientPlanDoc>> {
  return (await getDb()).collection<ClientPlanDoc>('clientCardioPlans');
}

/** Resolves the singleton plan collection for a given plan-version kind. */
export async function planCollectionForKind(kind: 'workout' | 'nutrition' | 'cardio'): Promise<Collection<ClientPlanDoc>> {
  if (kind === 'workout') return clientWorkoutPlansCol();
  if (kind === 'nutrition') return clientNutritionPlansCol();
  return clientCardioPlansCol();
}

export async function coachNotesCol(): Promise<Collection<CoachNoteDoc>> {
  return (await getDb()).collection<CoachNoteDoc>('coachNotes');
}

export async function coachTargetsCol(): Promise<Collection<CoachTargetsDoc>> {
  return (await getDb()).collection<CoachTargetsDoc>('coachTargets');
}

export async function checkInsCol(): Promise<Collection<WeeklyCheckInDoc>> {
  return (await getDb()).collection<WeeklyCheckInDoc>('checkIns');
}

export async function measurementLogsCol(): Promise<Collection<MeasurementLogDoc>> {
  return (await getDb()).collection<MeasurementLogDoc>('measurementLogs');
}

export async function notificationsCol(): Promise<Collection<AppNotificationDoc>> {
  return (await getDb()).collection<AppNotificationDoc>('notifications');
}

export async function subscriptionRequestsCol(): Promise<Collection<FreezeRequestDoc>> {
  return (await getDb()).collection<FreezeRequestDoc>('subscriptionRequests');
}

export async function planVersionsCol(): Promise<Collection<PlanVersionDoc>> {
  return (await getDb()).collection<PlanVersionDoc>('planVersions');
}

/** Fresh-start transfer archive — see `ArchivedClientDataDoc`'s doc comment. */
export async function archivedClientDataCol(): Promise<Collection<ArchivedClientDataDoc>> {
  return (await getDb()).collection<ArchivedClientDataDoc>('archivedClientData');
}
