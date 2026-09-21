import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { bannersRouter } from './routers/banners.js';
import { flagsRouter } from './routers/flags.js';
import { usageRouter } from './routers/usage.js';
import { messagesRouter } from './routers/messages.js';
import { notificationsRouter } from './routers/notifications.js';
import { coachAssetsRouter } from './routers/coachAssets.js';
import { coachPlansRouter } from './routers/coachPlans.js';
import { coachPlanTiersRouter } from './routers/coachPlanTiers.js';
import { coachClientsRouter } from './routers/coachClients.js';
import { invitesRouter } from './routers/invites.js';
import { transfersRouter } from './routers/transfers.js';
import { profileRouter, assessmentRouter } from './routers/clientProfile.js';
import { workoutPlanRouter, nutritionPlanRouter, cardioPlanRouter, planVersionsRouter } from './routers/clientPlans.js';
import { logsWorkoutRouter, logsNutritionRouter, logsWeightRouter, logsCardioRouter, logsChecklistRouter, photosRouter } from './routers/clientLogs.js';
import { coachNotesRouter, coachTargetsRouter } from './routers/clientCoachNotes.js';
import { checkInsRouter, measurementsRouter, subscriptionRequestRouter } from './routers/clientCheckIns.js';
import { adminStatsRouter, adminMembersRouter, adminGrowthRouter } from './routers/adminAnalytics.js';
import { adminCoachesRouter } from './routers/adminCoaches.js';
import { adminAuditRouter } from './routers/adminAudit.js';
import { adminUsersRouter } from './routers/adminUsers.js';
import { authRouter } from './routers/auth.js';
import { syncRouter } from './routers/sync.js';
import { foodSearchRouter } from './routers/foodSearch.js';

/**
 * The merged app router, deployed as the single `api/trpc/[trpc].ts`
 * function. Modules are added here as each one migrates off the old
 * per-module `[...path].ts`/`[[...path]].ts` dispatchers (see the migration
 * plan) — `banners`/`flags`/`usage` are the first (they were one Vercel
 * function, `api/banners/[[...path]].ts`; split into three namespaces here
 * to mirror the three existing frontend files: bannersApi/flagsApi/usageApi).
 */
export const appRouter = router({
  health: healthRouter,
  banners: bannersRouter,
  flags: flagsRouter,
  usage: usageRouter,
  messages: messagesRouter,
  notifications: notificationsRouter,
  coachAssets: coachAssetsRouter,
  coachPlans: coachPlansRouter,
  coachPlanTiers: coachPlanTiersRouter,
  coachClients: coachClientsRouter,
  invites: invitesRouter,
  transfers: transfersRouter,
  profile: profileRouter,
  assessment: assessmentRouter,
  workoutPlan: workoutPlanRouter,
  nutritionPlan: nutritionPlanRouter,
  cardioPlan: cardioPlanRouter,
  planVersions: planVersionsRouter,
  logsWorkout: logsWorkoutRouter,
  logsNutrition: logsNutritionRouter,
  logsWeight: logsWeightRouter,
  logsCardio: logsCardioRouter,
  logsChecklist: logsChecklistRouter,
  photos: photosRouter,
  coachNotes: coachNotesRouter,
  coachTargets: coachTargetsRouter,
  checkIns: checkInsRouter,
  measurements: measurementsRouter,
  subscriptionRequest: subscriptionRequestRouter,
  adminStats: adminStatsRouter,
  adminMembers: adminMembersRouter,
  adminGrowth: adminGrowthRouter,
  adminCoaches: adminCoachesRouter,
  adminAudit: adminAuditRouter,
  adminUsers: adminUsersRouter,
  auth: authRouter,
  sync: syncRouter,
  foodSearch: foodSearchRouter,
});

export type AppRouter = typeof appRouter;
