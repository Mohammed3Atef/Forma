import { fetchClientLogs, getClientAssessment, listMyClients } from './coachApi';
import { listCheckIns } from './checkInApi';
import { coachUnreadCount } from './messagesApi';
import { assessmentStatus } from '@/lib/assessment';
import type { AssessmentStatus, UserRecord, WorkoutLog } from '@/types';

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export interface ClientDashboardRow {
  client: UserRecord;
  workouts7d: number;
  lastActivity: string | null; // YYYY-MM-DD of the latest finished workout
  assessment: AssessmentStatus;
  needsAttention: boolean;
}

export interface CoachDashboard {
  totalClients: number;
  activeClients: number;
  pendingAssessments: number; // submitted / updated, awaiting coach review
  adherencePct: number; // % of clients with ≥1 finished workout in the last 7 days
  avgWorkouts7d: number; // avg finished workouts per client over the last 7 days
  checkinsToReview: number;
  unreadMessages: number;
  clients: ClientDashboardRow[];
}

/**
 * One-shot coach dashboard aggregate. Reuses existing per-client reads
 * (listMyClients, fetchClientLogs, getClientAssessment, listCheckIns) plus the
 * messages unread total. Client-side N+1 — fine for typical client counts;
 * call via React Query with a stale window. No new Firestore schema.
 */
export async function getCoachDashboard(coachId: string): Promise<CoachDashboard> {
  const clients = await listMyClients(coachId);
  const since = cutoff(7);

  const [rows, unreadMessages] = await Promise.all([
    Promise.all(
      clients.map(async (client) => {
        const [logs, assessment, checkIns] = await Promise.all([
          fetchClientLogs<WorkoutLog>(client.id, 'workoutLogs', 30),
          getClientAssessment(client.id),
          listCheckIns(client.id),
        ]);
        const finished = logs.filter((w) => w.finished);
        const workouts7d = finished.filter((w) => w.date >= since).length;
        const lastActivity = finished.reduce<string | null>((m, w) => (!m || w.date > m ? w.date : m), null);
        const assess = assessmentStatus(assessment);
        const toReview = checkIns.some((c) => c.status === 'submitted');
        const needsAttention = assess === 'submitted' || assess === 'updated_after_review' || workouts7d === 0 || toReview;
        return { client, workouts7d, lastActivity, assessment: assess, needsAttention, toReview };
      }),
    ),
    coachUnreadCount(coachId).catch(() => 0),
  ]);

  const activeClients = clients.filter((c) => c.accountStatus === 'active').length;
  const pendingAssessments = rows.filter((r) => r.assessment === 'submitted' || r.assessment === 'updated_after_review').length;
  const checkinsToReview = rows.filter((r) => r.toReview).length;
  const activeThisWeek = rows.filter((r) => r.workouts7d > 0).length;
  const adherencePct = clients.length ? Math.round((activeThisWeek / clients.length) * 100) : 0;
  const totalWorkouts = rows.reduce((s, r) => s + r.workouts7d, 0);
  const avgWorkouts7d = clients.length ? Math.round((totalWorkouts / clients.length) * 10) / 10 : 0;

  return {
    totalClients: clients.length,
    activeClients,
    pendingAssessments,
    adherencePct,
    avgWorkouts7d,
    checkinsToReview,
    unreadMessages,
    clients: rows.map(({ toReview: _toReview, ...row }) => row),
  };
}
