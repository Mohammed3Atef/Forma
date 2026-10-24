import type { Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import type { AuditLogDoc, CoachClientDoc, CoachPlanDoc } from './types.js';

export async function coachClientsCol(): Promise<Collection<CoachClientDoc>> {
  return (await getDb()).collection<CoachClientDoc>('coachClients');
}

export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

export async function auditLogsCol(): Promise<Collection<AuditLogDoc>> {
  return (await getDb()).collection<AuditLogDoc>('adminAuditLogs');
}
