# 07 — Services ↔ Callers ↔ tRPC reconciliation, Query-key registry, Dead code (Phase 2, direction B)

Scope: `src/services/**`, `src/hooks/*.ts`, `src/stores/*.ts`, every `useQuery`/`invalidateQueries`/`getQueryData` in `src/`, browser storage keys. Static/component-level only; every claim cites `file:line`. Procedure list dumped from `appRouter._def.procedures` (temporary `api/_trpc/_tmp-dump.test.ts`, deleted) = **173 leaf procedures**.

Counts: procedures 173 · frontend-called 153 (152 via `trpc` client + `auth.refresh` via raw fetch `src/services/platformApi.ts:38`) · test-only 20 · no caller 0 · query-key families 64 · mutation→query MISMATCH rows 12 (+1 key collision, +1 logout leak) · dead value exports 42 (+10 internal-only, +31 unused type exports) · no-op control hits 9 real (`href="#"`), 6 false positives.

---

## (a) tRPC caller reconciliation

Class: **FE** = active frontend caller · **TEST** = api test only · **NONE** = no caller. Wrapper = exported function in `src/services/**` that owns the call.

| Procedure | Caller(s) file:line | Wrapper | Class |
|---|---|---|---|
| adminAudit.create | services/platform/auditApi.ts:16 | writeAudit | FE |
| adminAudit.list | auditApi.ts:44 | fetchAuditPage | FE |
| adminCoaches.detail | coachPlanApi.ts:40 | getCoachPlan (admin fallback) | FE |
| adminCoaches.list | adminCoachesApi.ts:36, coachPlanApi.ts:120 | fetchCoachAdmin, listAllCoachPlans(dead) | FE |
| adminGrowth.get | adminGrowthApi.ts:26 | fetchGrowth | FE |
| adminMembers.get | adminMembersApi.ts:35 | fetchMembers | FE |
| adminStats.get | analyticsApi.ts:13 | fetchPlatformStats | FE |
| adminUsers.bulkSetStatus | accountsApi.ts:113 | bulkSetAccountStatus | FE |
| adminUsers.byRole | accountsApi.ts:68 | fetchByRole | FE |
| adminUsers.create | accountsApi.ts:84 | createUser | FE |
| adminUsers.delete | accountsApi.ts:122 | deleteUser | FE |
| adminUsers.get | accountsApi.ts:59 | fetchUser | FE |
| adminUsers.list | accountsApi.ts:54 | fetchUsersPage | FE |
| adminUsers.searchClients | accountsApi.ts:79 | searchClients | FE |
| adminUsers.setPermissions | accountsApi.ts:131 | setPermissions — **wrapper has no UI caller** (S-17) | FE (wrapper only) |
| adminUsers.setRole | accountsApi.ts:127 | setRole | FE |
| adminUsers.setStatus | accountsApi.ts:97, coachPlanApi.ts:212 | setAccountStatus, setCoachSuspended | FE |
| assessment.get | clientCoachApi.ts:39, coachApi.ts:78 | fetchMyAssessment, getClientAssessment | FE |
| assessment.reset | coachApi.ts:93 | resetAssessment | FE |
| assessment.review | coachApi.ts:88 | markAssessmentReviewed | FE |
| assessment.saveDraft | clientCoachApi.ts:48 | saveAssessmentProgress | FE |
| assessment.setCoachNotes | coachApi.ts:83 | setAssessmentCoachNotes | FE |
| assessment.submit | clientCoachApi.ts:62 | submitAssessment | FE |
| auth.changePassword | auth/mongoAuth.ts:80 | mongoAuth.changePassword | FE |
| auth.confirmPasswordReset | mongoAuth.ts:88 | mongoAuth.confirmPasswordReset | FE |
| auth.googleSignIn | mongoAuth.ts:54 | mongoAuth.signInWithGoogle | FE |
| auth.login | mongoAuth.ts:47 | mongoAuth.signIn | FE |
| auth.logout | mongoAuth.ts:60 | mongoAuth.signOutUser | FE |
| auth.me | mongoAuth.ts:65 | mongoAuth.me | FE |
| auth.refresh | **services/platformApi.ts:38 (raw `fetch('/api/trpc/auth.refresh')`)**; api/_trpc/routers/auth.test.ts:95 | refreshSession | FE (Phase 1 mis-classed as test-only) |
| auth.requestPasswordReset | mongoAuth.ts:84 | mongoAuth.requestPasswordReset | FE |
| auth.signup | mongoAuth.ts:41 | mongoAuth.signUpCoach | FE |
| auth.updateProfile | mongoAuth.ts:76 | mongoAuth.updateProfile | FE |
| banners.create / update / delete / list / forViewer | bannersApi.ts:64 / :61 / :72 / :32 / :103 | saveBanner, deleteBanner, listBanners, fetchBannersForViewer | FE |
| cardioPlan.get | clientCoachApi.ts:31, planApi.ts:44 | fetchMyCardioPlan, getClientCardioPlan | FE |
| cardioPlan.save | planApi.ts:48 | saveClientCardioPlan | FE |
| checkIns.delete | api/_trpc/routers/coverage.test.ts:219-221 | — | TEST |
| checkIns.get / list / listForCoachClients / request / submit / review | checkInApi.ts:33 / :39 / :62 / :76 / :81 / :86 | getCheckIn, listCheckIns(+getActiveCheckIn), listCheckInsForCoachClients, requestCheckIn, submitCheckIn, reviewCheckIn | FE |
| coachAssets.billingPlans.delete / list / save | coachPlansApi.ts:42 / :16 / :27 | deleteCoachPlan, listCoachPlans, saveCoachPlan | FE |
| coachAssets.billingPlans.get | coachAssets.test.ts:155, coverage.test.ts:126 | — | TEST |
| coachAssets.billingPlans.update | coverage.test.ts:125 | — | TEST |
| coachAssets.exercises.delete / get / list / save | coachAssetsApi.ts:64 / :42 / :36 / :59 | deleteExercise, getExercise, listExercises, saveExercise | FE |
| coachAssets.exercises.update | coachAssets.test.ts:86,330,387 | — | TEST |
| coachAssets.foodGroups.delete / list / save | coachAssetsApi.ts:220 / :212 / :216 | deleteFoodGroup, listFoodGroups, saveFoodGroup | FE |
| coachAssets.foodGroups.get / update | coverage.test.ts:110 / :111 | — | TEST |
| coachAssets.foods.delete / list / save | coachAssetsApi.ts:208 / :199 / :204 | deleteFood, listFoods, saveFood | FE |
| coachAssets.foods.get / update | coverage.test.ts:104 / :105 | — | TEST |
| coachAssets.nutritionTemplates.list | coachAssetsApi.ts:272 | listNutritionTemplates (only consumer: coachDashboardApi.ts:82 count) | FE |
| coachAssets.nutritionTemplates.save / delete | coachAssetsApi.ts:276 / :280 | saveNutritionTemplate / deleteNutritionTemplate — **no UI caller** (S-17) | FE (wrapper only) |
| coachAssets.nutritionTemplates.get / update | coverage.test.ts:87 / :88 | — | TEST |
| coachAssets.seedStarterLibrary | starterLibraryApi.ts:53 | seedStarterLibrary | FE |
| coachAssets.supplements.delete / list / save | coachAssetsApi.ts:235 / :226 / :231 | deleteSupplement, listSupplements, saveSupplement | FE |
| coachAssets.supplements.get / update | coverage.test.ts:117 / :118 | — | TEST |
| coachAssets.workoutTemplates.delete / get / list / save | coachAssetsApi.ts:121 / :109 / :104 / :117 | deleteWorkoutTemplate, getWorkoutTemplate, listWorkoutTemplates, saveWorkoutTemplate | FE |
| coachAssets.workoutTemplates.update | coverage.test.ts:132 | — | TEST |
| coachClients.assign | coachClientsApi.ts:79 (linkCoachClient, dead), :88 (assignClientToCoach), :240 (assignExistingClient) | — | FE |
| coachClients.dashboardSummaries | coachApi.ts:69 | listClientDashboardSummaries | FE |
| coachClients.end | coachClientsApi.ts:118 (unassignClient), :248 (releaseClient) | — | FE |
| coachClients.get | coachClientsApi.ts:125 | getRelationship | FE |
| coachClients.list | coachClientsApi.ts:59 (dead listRelationshipsForCoach), :65, :218, :225 | listAllRelationshipsForCoach, getClientAssignment, listClientCoachHistory | FE |
| coachClients.listMyClientUsers | coachApi.ts:49 | listMyClients | FE |
| coachClients.transfer | coachClientsApi.ts:288 | transferClientWithMode | FE |
| coachClients.updateSubscription | coachClientsApi.ts:134 | patchSubscription → setSubscriptionTerm/Price/freeze/unfreeze/end/cancel/extend | FE |
| coachNotes.create / list | coachApi.ts:247 / :227, clientCoachApi.ts:21 | addCoachNote, listCoachNotes, fetchMyCoachNotes | FE |
| coachNotes.delete / update | client.test.ts:313 / :311 | — (no edit/delete note UI) | TEST |
| coachPlanRequests.cancel / confirm / get / listPending / reject / submit | coachPlanRequestsApi.ts:28 / :41 / :15 / :36 / :48 / :20 | cancelPlanRequest, confirmPlanRequest, getMyPlanRequest, listPendingPlanRequests, rejectPlanRequest, submitPlanRequest | FE |
| coachPlanTiers.coreFeatures / list / public / save / saveCoreFeatures | coachPlanTiersApi.ts:45 / :26 / :36 / :89,:120 / :50 | getCoreFeatures, listCoachPlanTiers, getPublicPlanTiers, saveCoachPlanTier+archiveCoachPlanTier, saveCoreFeatures | FE |
| coachPlans.adminUpdate | coachPlanApi.ts:131,154,171,188,211,226 | setCoachTier, extendCoachTrial, renewCoachPlan, setCoachMaxClients, setCoachSuspended, setCoachPlanEndsAt | FE |
| coachPlans.createTrial | coachPlanApi.ts:61 | createTrialPlan — **no UI caller** (dead; signup does it server-side) | FE (wrapper only) |
| coachPlans.me | coachPlanApi.ts:32 | getCoachPlan | FE |
| coachTargets.get | clientCoachApi.ts:26, coachApi.ts:302 | fetchMyCoachTargets (used), getCoachTargets (dead) | FE |
| coachTargets.set | coachApi.ts:312 | setCoachTargets — **no UI caller** (S-17) | FE (wrapper only) |
| flags.list / save | flagsApi.ts:5 / :10 | listFlags, saveFlag | FE |
| foodSearch.search | foodSearchApi.ts:24 | searchFoods | FE |
| health.ping | certification.test.ts:119 | — | TEST |
| invites.claim | pages/auth/AcceptInvite.tsx:95 (direct trpc) | — | FE |
| invites.create / getByCode / list / revoke | inviteApi.ts:110 / :117 / :127 / :133 | createInvite, getInvite, listPendingInvites, revokeInvite | FE |
| logsCardio.get | coverage.test.ts:206 | — | TEST |
| logsCardio.list | coachApi.ts:144, :167 | fetchClientLogs('cardioLogs'), fetchClientDay | FE |
| logsChecklist.get | coachApi.ts:168 | fetchClientDay | FE |
| logsChecklist.list | coverage.test.ts:205 | — | TEST |
| logsNutrition.get / list, logsWeight.get / list, logsWorkout.get / list | coachApi.ts:165/:138, :166/:141, :164/:135 | fetchClientDay, fetchClientLogs | FE |
| measurements.delete | client.test.ts:404 | — | TEST |
| measurements.get | coverage.test.ts:229-232 | — | TEST |
| measurements.list / save | coachApi.ts:184 / :220 | fetchClientMeasurements, saveClientMeasurement | FE |
| media.listImages / status | mediaApi.ts:261 / :88 | listAllImages, useUploadConfig.load | FE (added after Phase 1) |
| messages.coachThreadsSummary / delete / edit / list / markRead / react / send | messagesApi.ts:227 / :157 / :151 / :53,:96,:169 / :177, notificationsApi.ts:136 / :163 / :139 | coachThreadsSummary(+subscribe*), deleteMessage, editMessage, listMessages(dead)+subscribeMessages+listOlderMessages, markThreadSeen+markMessageNotificationsSeen, reactToMessage, sendMessage | FE |
| notifications.list / markRead | notificationsApi.ts:71,:97(dead),:147(dead) / :125 | pollFeed→subscribeNotifications/subscribeCoachNotifications, markNotificationSeen | FE |
| nutritionPlan.get / save | planApi.ts:36 / :40 | getClientMealPlan, saveClientMealPlan | FE |
| photos.list | coachApi.ts:195 | fetchClientPhotos | FE |
| planVersions.list / restore / save | planVersionsApi.ts:22 / :45 / :39 | listVersions, restoreVersion, saveAsNewVersion | FE |
| profile.get | clientCoachApi.ts:35, coachApi.ts:73 | fetchMyProfile, fetchClientProfile | FE |
| profile.save | coachApi.ts:116 | saveClientProfile — **no UI caller** (dead) | FE (wrapper only) |
| subscriptionRequest.cancel / decide / get / submit | clientCoachApi.ts:92 / coachApi.ts:111 / clientCoachApi.ts:78,coachApi.ts:100 / clientCoachApi.ts:87 | cancelFreezeRequest, resolveFreezeRequest, fetchMyFreezeRequest+getClientFreezeRequest, submitFreezeRequest | FE |
| sync.deletionsPull / deletionsPush / pull / push / singletonGet / singletonSet / wipe | data/sync/SyncEngine.ts:158 / :138 / :105 / :87 / :120 / :122 / :174 | SyncEngine | FE |
| transfers.create / list / resolve | transferApi.ts:61 / :88,:94,:100 / :83,:116 | submitTransferRequest, listPending/Incoming/OutgoingTransferRequests, cancelTransferRequest+resolveTransferRequest | FE |
| usage.bump / fetch / recordActiveDay | usageApi.ts:14 / :30 / :8 | bumpUsage, fetchUsage, recordActiveDay | FE |
| workoutPlan.get / save / updateExerciseFromLibrary | planApi.ts:18 / :22 / :32 | getClientWorkoutPlan, saveClientWorkoutPlan, updatePlanExerciseFromLibrary | FE |

**Differences vs Phase 1 (150/6/15):** (1) `media.status`, `media.listImages` added → +2 FE. (2) `auth.refresh` is frontend-called through a raw fetch in `platformApi.ts:36-53` (deliberately bypasses the `trpc` client to avoid 401-refresh recursion) → moves TEST→FE. (3) All 15 Phase-1 "no caller" procedures now have api tests in the new untracked `api/_trpc/routers/coverage.test.ts` / `certification.test.ts` → NONE→TEST. Net: 153 / 20 / 0. Six procedures are reachable only through a wrapper that no UI calls (`adminUsers.setPermissions`, `coachTargets.set`, `nutritionTemplates.save/delete`, `coachPlans.createTrial`, `profile.save`) — see (b)/S-17.

---

## (b) Service / hook / store export inventory

Verdict legend: **LIVE** · **INTERNAL** (used only inside its own module → drop `export`) · **DEAD** (no caller, safe to delete) · **STUB** (intentional no-op/throw) · **MISSING-UI** (backend + wrapper exist, product interaction absent). Types-only unused exports are listed once at the end.

| Export | Callers (file:line) | Verdict |
|---|---|---|
| accountsApi.fetchUsersPage | AdminAccounts.tsx:136 | LIVE |
| accountsApi.fetchUser | 15 callers (CoachTimeline.tsx:35, IncomingTransferRequests.tsx:35-40, useCoachClientHeader.ts:29, CoachClientDetail.tsx:65, AdminClientDetail.tsx:25, AdminCoachDetail.tsx:48, CoachViewLayout.tsx:39, CoachMessageThread.tsx:19, CoachClientSubscriptionTab.tsx:15, clientCoachApi.ts:69 …) | LIVE |
| accountsApi.fetchByRole | AdminAssignments.tsx:40-41, AdminMedia.tsx:30 | LIVE |
| accountsApi.searchClients | AddExistingClient.tsx:83 | LIVE |
| accountsApi.createUser | AdminAccounts.tsx:536 | LIVE |
| accountsApi.setAccountStatus | AdminAccounts.tsx:165, AdminMembers.tsx:80, CoachSubscriptionPanel.tsx:81 | LIVE |
| accountsApi.bulkSetAccountStatus | AdminAccounts.tsx:192, AdminCoaches.tsx:110 | LIVE |
| accountsApi.deleteUser | AdminAccounts.tsx:183 | LIVE |
| accountsApi.setRole | AdminAccounts.tsx:174 | LIVE |
| accountsApi.setPermissions | NONE (AdminGovernance.tsx:107-140 renders permissions read-only; no editor) | MISSING-UI |
| adminCoachesApi.fetchCoachAdmin | AdminAssignments.tsx:128, AdminCoaches.tsx:68, AdminSubscriptions.tsx:40, OverviewPanel.tsx:27 | LIVE |
| adminGrowthApi.fetchGrowth | AdminAnalytics.tsx:34, AdminSubscriptions.tsx:43, OverviewPanel.tsx:28 | LIVE |
| adminMembersApi.fetchMembers / inSegment | AdminMembers.tsx:73 / :93 | LIVE |
| analyticsApi.fetchPlatformStats | AdminAnalytics.tsx:32, OverviewPanel.tsx:25 | LIVE |
| auditApi.writeAudit | 14 (coachApi.ts:221, coachPlanApi.ts:132…, coachPlanTiersApi.ts:51,108,130, coachPlanRequestsApi.ts:22,30,42,49) | LIVE |
| auditApi.fetchAuditPage | AdminAudit.tsx:43,55, OverviewPanel.tsx:26 | LIVE |
| bannersApi.listBanners / saveBanner / deleteBanner / fetchBannersForViewer | AdminBanners.tsx:44 / :48,:58 / :53 / BannerHost.tsx:62 | LIVE |
| bannersApi.matchesViewer | NONE (server has its own `api/banners/_lib.ts:70`) | DEAD |
| checkInApi.getCheckIn / listCheckIns / getActiveCheckIn / listCheckInsForCoachClients / requestCheckIn / submitCheckIn / reviewCheckIn | CheckIn.tsx:42 / CheckInHistory.tsx:29,CoachCheckIns.tsx:31 / useActiveCheckIn.ts:16 / CoachCheckInsOverview.tsx:55 / CoachCheckIns.tsx:42,CoachCheckInsOverview.tsx:106 / CheckIn.tsx:48 / CoachCheckIns.tsx:84,CoachCheckInsOverview.tsx:86 | LIVE |
| checkInApi.checkInTrends | NONE | DEAD |
| clientCoachApi.fetchMyCoachNotes / fetchMyCoachTargets / fetchMyCardioPlan / fetchMyProfile / fetchMyAssessment / saveAssessmentProgress / submitAssessment / fetchMyCoach / fetchMyRelationship / fetchMyFreezeRequest / submitFreezeRequest / cancelFreezeRequest | ClientNotesProvider.tsx:16,useCoachContent.ts:16 / useCoachContent.ts:17,clientSync.ts:68 / Cardio.tsx:115 / clientSync.ts:69 / useAssessmentStatus.ts:17,MyAssessment.tsx:40,Progress.tsx:193,Settings.tsx:161 / AssessmentWizard.tsx:165 / :202 / CoachInfoCard.tsx:22,NotificationBell.tsx:43,Messages.tsx:17,Notifications.tsx:77 / useSubscription.ts:21 / ClientSubscriptionSection.tsx:34 / :41 / :48 | LIVE |
| clientSync.scopeLocalToUser / loadCoachAssignedContent | ClientApp.tsx:87 / :88 | LIVE |
| coachApi.listMyClients | 12 (NotificationBell.tsx:38, AdminCoachDetail.tsx:56, CoachAdherence.tsx:24, CoachAssessments.tsx:35, CoachCheckInsOverview.tsx:48, CoachClients.tsx:91, CoachMessages.tsx:50, CoachPlan.tsx:34, CoachTemplatePreview.tsx:32, RoleAccount.tsx:36, Notifications.tsx:72, coachDashboardApi.ts:78) | LIVE |
| coachApi.listClientDashboardSummaries | CoachAdherence.tsx:32, CoachAssessments.tsx:42, coachDashboardApi.ts:79 | LIVE |
| coachApi.fetchClientProfile | useCoachClientHeader.ts:30 | LIVE |
| coachApi.getClientAssessment / setAssessmentCoachNotes / markAssessmentReviewed / resetAssessment | useCoachClientHeader.ts:31,AdminClientDetail.tsx:29,CoachClientAssessment.tsx:36,CoachClientDetail.tsx:106 / CoachClientAssessment.tsx:45 / :46 / :47 | LIVE |
| coachApi.getClientFreezeRequest / resolveFreezeRequest | CoachSubscriptionPanel.tsx:60 / :90 | LIVE |
| coachApi.saveClientProfile | NONE (profile is derived on `assessment.submit`, clientProfile.ts:101-160) | DEAD |
| coachApi.fetchClientLogs / fetchClientDay / fetchClientMeasurements / fetchClientPhotos / fetchClientWeightLogs / saveClientMeasurement | useCoachClientHeader.ts:33,CoachClientDetail.tsx:76,81 / ClientActivityView.tsx:32,CoachViewCardio.tsx:16,CoachViewNutrition.tsx:29 / CoachViewMeasurements.tsx:20,CoachViewProgress.tsx:13 / CoachViewPhotos.tsx:16 / CoachViewProgress.tsx:12 / CoachViewMeasurements.tsx:28 | LIVE |
| coachApi.fetchClientCardioLogs | NONE (CoachViewCardio uses fetchClientDay) | DEAD |
| coachApi.listCoachNotes / addCoachNote | CoachClientDetail.tsx:86,363, CoachClientNotes.tsx:26,30, CoachViewLayout.tsx:40,48 | LIVE |
| coachApi.broadcastAnnouncement | NONE (CoachMessages uses messagesApi.broadcast) | DEAD |
| coachApi.listAssignedPlans / assignPlan / deleteAssignedPlan / listTemplates / createTemplate / deleteTemplate / assignTemplate | NONE (legacy no-op block coachApi.ts:263-297) | DEAD (stubs) |
| coachApi.getCoachTargets | NONE | DEAD |
| coachApi.setCoachTargets | NONE — no coach-side editor for water/steps/cardio targets although the client consumes them (useCoachContent.ts:17, clientSync.ts:108-116) | MISSING-UI |
| coachAssetsApi.listExercises / getExercise / saveExercise / deleteExercise | ExercisePickerSheet.tsx:39,CoachExerciseLibrary.tsx:91 / PlanBuilder.tsx:193 / ExercisePickerSheet.tsx:106,CoachExerciseLibrary.tsx:111 / CoachExerciseLibrary.tsx:146 | LIVE |
| coachAssetsApi.snapshotPlanBody | internal :125,:152,:179 | INTERNAL |
| coachAssetsApi.listWorkoutTemplates / getWorkoutTemplate / saveWorkoutTemplate / deleteWorkoutTemplate / duplicateWorkoutTemplate / assignWorkoutTemplate / saveClientPlanAsTemplate | CoachTemplates.tsx:30,CoachChecklist.tsx:30,coachDashboardApi.ts:81 / CoachTemplatePreview.tsx:33,CoachWorkoutTemplateEditor.tsx:38 / CoachWorkoutTemplateEditor.tsx:67 / CoachTemplatePreview.tsx:43 / :38 / AssignTemplate.tsx:29 / CoachWorkoutEditor.tsx:171 | LIVE |
| coachAssetsApi.listFoods / saveFood / deleteFood / listFoodGroups / saveFoodGroup / deleteFoodGroup / listSupplements / saveSupplement / deleteSupplement / bulkDelete* | CoachExerciseLibrary.tsx:271,423,282,287,422,426,431,536,546,551,156,297,440,560; CoachNutritionEditor.tsx:76-78; CoachTemplates.tsx:41 | LIVE |
| coachAssetsApi.listNutritionTemplates | coachDashboardApi.ts:82 (count only) | LIVE (count only) |
| coachAssetsApi.saveNutritionTemplate / deleteNutritionTemplate / assignNutritionTemplate | NONE — zero `.tsx` references to NutritionTemplate; no "Save as template" in CoachNutritionEditor.tsx, no nutrition tab in CoachTemplates.tsx | MISSING-UI |
| coachClientsApi.relId / transferApi.transferReqId | internal only (coachClientsApi.ts:118,125,134,248,289 / transferApi.ts:78,83,117) | INTERNAL |
| coachClientsApi.listRelationshipsForCoach / linkCoachClient / transferClient / planToSubscriptionInput | NONE | DEAD |
| coachClientsApi.listAllRelationshipsForCoach / assignClientToCoach / unassignClient / getRelationship / setSubscriptionTerm / setSubscriptionPrice / freezeSubscription / unfreezeSubscription / endSubscription / cancelSubscription / extendSubscription / getClientAssignment / listClientCoachHistory / assignExistingClient / releaseClient / transferClientWithMode | coachDashboardApi.ts:80 / AdminAssignments.tsx:99 / :108 / useCoachClientHeader.ts:32,CoachSubscriptionPanel.tsx:59,clientCoachApi.ts:74 / CoachSubscriptionPanel.tsx:101 / :117 / :91,:109 / :84 / :85 / :86 / :87 / AddExistingClient.tsx:86-87 / CoachTimeline.tsx:30 / AddExistingClient.tsx:249 / IncomingTransferRequests.tsx:64,AddExistingClient.tsx:272,CoachClientDetail.tsx:53 / TransferWizard.tsx:73 | LIVE |
| coachClientsApi.archiveAndClearCoachData | NONE (server does it in transfer, coachClientsApi.ts:251-265) | STUB |
| coachDashboardApi.getCoachDashboard | ClientSwitcherSheet.tsx:32, CoachClients.tsx:99, CoachDashboard.tsx:31, CoachReports.tsx:24, CoachRevenue.tsx:21 | LIVE |
| coachPlanApi.getCoachPlan / trialDaysLeft / coachPlanState / setCoachTier / extendCoachTrial / renewCoachPlan / setCoachMaxClients / setCoachSuspended / setCoachPlanEndsAt / markTrialNotified | 7 / 10 / 3 / AdminCoachDetail.tsx:76 / :77 / :78,AdminCoaches.tsx:74 / :79 / :86,AdminCoaches.tsx:86 / :80 / coachTrialApi.ts:39 | LIVE |
| coachPlanApi.markTrialNotified | coachTrialApi.ts:39 — body is `void` (coachPlanApi.ts:71-77) | STUB (T-4) |
| coachPlanApi.createTrialPlan / bumpActiveClientCount / listAllCoachPlans / COACH_PLAN_TIERS / TRIAL_DURATION_DAYS | NONE | DEAD |
| coachPlanApi.TRIAL_MAX_CLIENTS / PAID_TERM_DAYS | internal (:112 / :168) | INTERNAL |
| coachPlanRequestsApi.getMyPlanRequest / submitPlanRequest / cancelPlanRequest / listPendingPlanRequests / confirmPlanRequest / rejectPlanRequest | CoachPlanBanner.tsx:28,CoachPlan.tsx:35 / :40 / :50 / useNotifications.ts:49,AdminCoachDetail.tsx:54,AdminCoaches.tsx:71,AdminSubscriptions.tsx:41,OverviewPanel.tsx:29 / AdminCoachDetail.tsx:110 / :115 | LIVE |
| coachPlanRequestsApi.isTRPCConflict | NONE (CoachPlan.tsx:47 does its own `instanceof TRPCClientError`) | DEAD |
| coachPlansApi.listCoachPlans / saveCoachPlan / deleteCoachPlan | SubscriptionPlanPicker.tsx:47,CoachSubscriptionPanel.tsx:377,CoachSubscriptionPlans.tsx:37 / :43 / :56 | LIVE |
| coachPlanTiersApi.tierLabel / listCoachPlanTiers / getPublicPlanTiers / getCoreFeatures / saveCoreFeatures / saveCoachPlanTier / archiveCoachPlanTier | 11 / AdminCoachDetail.tsx:57,AdminPlans.tsx:54,CoachPlan.tsx:36,RoleAccount.tsx:35 / Pricing.tsx:18 / AdminPlans.tsx:56,Pricing.tsx:19 / AdminPlans.tsx:60 / :70 / :91 | LIVE |
| coachPlanTiersApi.getCoachPlanTier | internal :119 | INTERNAL |
| coachTrialApi.checkTrialExpiry | CoachDashboard.tsx:37 — but both its effects are no-ops (`markTrialNotified` void, `notify` void) | LIVE but inert (S-17) |
| flagsApi.listFlags / saveFlag | AdminGovernance.tsx:41 / :43,:174 | LIVE |
| foodSearchApi.searchFoods / scaleNutrition | FoodSearchPicker.tsx:34 / :41 | LIVE |
| inviteApi.inviteLink / createInvite / getInvite / listPendingInvites / revokeInvite / isClaimable | CoachClients.tsx:416,429,438,480 / :390 / AcceptInvite.tsx:45 / CoachClients.tsx:379 / :373,:410 / AcceptInvite.tsx:47 | LIVE |
| inviteApi.generateInviteCode / buildClaimSubscription | NONE (server-side copies exist) | DEAD |
| inviteApi.claimInvite | NONE — throws (inviteApi.ts:154-159) | STUB |
| inviteApi.unclaimInvite | NONE — console.warn no-op | STUB |
| mediaApi.UploadError / useUploadConfigured / ensureUploadConfig / uploadFile / uploadImage / listAllImages | 6 / 8 / photoStore.ts:31 / MessageThread.tsx:383,ExerciseForm.tsx:66 / AvatarPicker.tsx:37,PosePhotoPicker.tsx:28,AssessmentWizard.tsx:601,photoStore.ts:34 / AdminMedia.tsx:25 | LIVE |
| mediaApi.SINGLE_MAX_BYTES | NONE (internal use is unqualified; export unused) | DEAD export |
| messagesApi.subscribeMessages / sendMessage / editMessage / deleteMessage / reactToMessage / listOlderMessages / markThreadSeen / subscribeThreadMeta / subscribeCoachThreadsSummary / coachUnreadCount / subscribeCoachUnread / broadcast | MessageThread.tsx:189,397,538,551,563,211,305 / useClientMessageUnread.ts:21 / CoachMessages.tsx:63 / coachDashboardApi.ts:83 / useCoachMessageUnread.ts:22 / CommandHost.tsx:53,CoachMessages.tsx:37,300 | LIVE |
| messagesApi.listMessages / threadMeta | NONE | DEAD |
| messagesApi.coachThreadsSummary | internal :253,:278 | INTERNAL |
| notificationsApi.subscribeNotifications / subscribeCoachNotifications / markNotificationSeen / markMessageNotificationsSeen | useNotifications.ts:69 / :69 / NotificationBell.tsx:89,Notifications.tsx:140 / MessageThread.tsx:307,Notifications.tsx:136 | LIVE |
| notificationsApi.notify | coachTrialApi.ts:40 — body no-op (notificationsApi.ts:34-36) | STUB (T-4) |
| notificationsApi.listNotifications / listCoachNotifications | NONE | DEAD |
| planApi.* (7) | AdminClientDetail.tsx:26-28, ClientActivityView.tsx:33-34, CoachClientDetail.tsx:91-101, editors :38/:75/:47, PlanVersionHistory.tsx:47, clientSync.ts:66-67, PlanBuilder.tsx:190, coachAssetsApi.ts:168,298 | LIVE |
| planVersionsApi.listVersions / saveAsNewVersion / restoreVersion | PlanVersionHistory.tsx:43 / VersionActions.tsx:47,coachAssetsApi.ts:150 / PlanVersionHistory.tsx:52 | LIVE |
| queryClient.queryClient | AdminApp.tsx:45, AnonymousApp.tsx:30, ClientApp.tsx:62, CoachApp.tsx:69 | LIVE |
| starterLibraryApi.seedStarterLibrary | CoachExerciseLibrary.tsx:134, LoadStarterLibraryButton.tsx:20 | LIVE |
| starterLibraryApi.fetchStarterExercises | NONE (seeding moved server-side) | DEAD |
| transferApi.submitTransferRequest / getTransferRequest / cancelTransferRequest / listPendingTransferRequests / listIncomingTransferRequests / resolveTransferRequest | AddExistingClient.tsx:261 / :245 / :266 / AdminAssignments.tsx:79,OverviewPanel.tsx:30 / IncomingTransferRequests.tsx:31 / IncomingTransferRequests.tsx:63,70,AdminAssignments.tsx:117 | LIVE |
| transferApi.listOutgoingTransferRequests | internal :77 | INTERNAL |
| usageApi.recordActiveDay / bumpUsage / fetchUsage | PresenceTracker.tsx:21 / AdminMembers.tsx:61 / AdminAnalytics.tsx:33 | LIVE |
| auth/cloudStore.useCloud / cloudStatus | App.tsx:88, Onboarding.tsx:18, SyncStatusIndicator.tsx:20-21, SyncStatusBadge.tsx:16, Settings.tsx:174 | LIVE (`signIn`/`signOut` members deprecated no-ops, cloudStore.ts:124-131; Settings.tsx:485 calls the deprecated `cloudState.signOut` → only logs a warning, does NOT sign out — see S-27) |
| auth/mongoAuth.mongoAuth | sessionStore.ts:82-178, ResetPassword.tsx:33 | LIVE |
| auth/permissions.can / useCan / useRole | 25 / 8 / 3 | LIVE |
| auth/permissions.effectivePermissions | internal :21 | INTERNAL |
| auth/permissions.useFlag | NONE | DEAD |
| auth/roles.ALL_PERMISSIONS / ROLE_PERMISSIONS | AdminGovernance.tsx:121 / :138, permissions.ts:15 | LIVE |
| auth/roles.SELF_SIGNUP_STATUS / homeFor | NONE | DEAD |
| auth/sessionStore.useSession | 121 | LIVE |
| platformApi.setAccessToken / getAccessToken / refreshSession | 7 / trpc.ts:17, mediaApi.ts:154,160 / mongoAuth.ts:70, trpc.ts:27, mediaApi.ts:155,174 | LIVE |
| trpc.trpc / TRPCClientError | 184 / 11 | LIVE |
| hooks: useActiveCheckIn(1) useAssessmentStatus(1) useBack(26) useClientMessageUnread(2) useCoachClientHeader(4)+SUB_TONE(13) useCoachContent(2) useCoachMessageUnread(3) useElapsed(2) useFullBleed(14) useGuardedNav(1) useInfiniteScroll(3) useLocalized(8) useLocalizedList(1) useIsTabletUp(2) useIsDesktop(11) useNotifications(2) useOnlineStatus(10) usePagination(10) useReveal(2) useSelection(7) useSubscription(8) useUnsavedGuard(3) useVoiceRecorder(1) useWakeLock(2) | counts = external callers | LIVE |
| hooks/useMediaQuery.useMediaQuery | internal :26-27 only | INTERNAL |
| stores: useCardio(18) useCommandStore(4) useDay(21) useDialog(1) confirmDialog(56) alertDialog(53) confirmDelete(11) useFocus(4) useHabits(8) notifyHabitChange(13) useImageViewer(1) viewImages(7) useLayoutStore(2) useMeasurements(10) setNavGuard(2) confirmLeave(3) hasNavGuard(1) computeConsumed(4) useNutrition(20) usePhotos(9) useSettings(31) useSidebarStore(2) setSubscriptionReadOnly(1) isSubscriptionReadOnly(12) useTimer(4) useToasts(2) showToast(68) useVideoPopup(1) playVideo(1) useVideos(14) warmupCountOf(5) useWorkout(47) | | LIVE |
| Unused **type** exports (harmless): CreateAccountParams, UserPage, UsersPageFilter, GrowthPoint, ExpiringClient, GrowthData, MembersData, PlatformStats, AuditPage, AuditFilters, ViewerCtx, CoachClientCheckInSummary, CheckInTrendPoint, ClientDashboardSummary, ClientDay, NoteAnchor, ExerciseSyncResult, CreateInviteInput, UploadErrorCode, UploadResult, UploadOptions, CoachThreadSummary, NewNotification, SeedResult, UsageData, SessionPhase, Selection, UnsavedGuardCopy, VoiceRecorderState, ToastInput, PrevPerf(1) | | P3 |

**Optional callback props**: scripted scan of every `on[A-Z]\w*?:` prop across `src/**/*.tsx` found **0** props that are never read by the receiving component and **0** that no caller ever supplies.

**Phase 1 list resolved one by one:** `setPermissions` → MISSING-UI (backend live; `roles.ts:28-30` says admins need explicit `clients.writeAll` grant but nothing can grant it) · `saveClientProfile` → DEAD · `setCoachTargets` → MISSING-UI (clients render coach targets, coach cannot set them) · `saveNutritionTemplate/deleteNutritionTemplate` (+`assignNutritionTemplate`) → MISSING-UI ("Save as template"/nutrition templates tab absent; only the dashboard count uses the list) · `createTrialPlan` → DEAD · `claimInvite`/`unclaimInvite`/`archiveAndClearCoachData` → STUB by design · `notify` + `markTrialNotified` → STUB: `checkTrialExpiry` (coachTrialApi.ts:24-56) runs on every coach dashboard mount and does nothing persistent (T-4 confirmed) · matchesViewer, checkInTrends, listRelationshipsForCoach, linkCoachClient, planToSubscriptionInput, bumpActiveClientCount, listAllCoachPlans, isTRPCConflict, generateInviteCode, buildClaimSubscription, listMessages, threadMeta, listNotifications, listCoachNotifications, fetchStarterExercises → DEAD · snapshotPlanBody, relId, getCoachPlanTier, transferReqId, listOutgoingTransferRequests → INTERNAL (drop `export`).

---

## (c) No-op / dead-control grep results

| Pattern | Hits | Verdict |
|---|---|---|
| `onClick={() => {}}`, `onClick={undefined}`, `=> undefined}`, `onChange/onSubmit={() => {}}` | 0 | — |
| `TODO` / `FIXME` / `XXX` / `HACK` in src | 0 | — |
| console-only arrow handlers `=> console.*(` | 0 | — |
| `href="#"` | Experience.tsx:80, :385 (brand), :426 Exercises, :429 Foods, :432 Templates, :435 Assessments, :443 About, :452 Privacy, :455 Terms | **9 real dead links** in the routed anonymous landing (AnonymousApp.tsx:12,37) — S-25 |
| `preventDefault()` with no follow-up | 24 sites; each is followed by an action (BottomNav.tsx:22-23 confirmLeave, CommandHost.tsx:31, DialogHost.tsx:34/37 focus trap, Sheet.tsx:77/80, CommandPalette.tsx:66-106, TagInput.tsx:41, DataTable.tsx:98 onRowClick, MessageThread.tsx:854/1021/1046, forms below) | 0 dead |
| `onSubmit=` forms | AdminAccounts.tsx:558, AdminBanners.tsx:156, AdminGovernance.tsx:188, AcceptInvite.tsx:139, CompleteAccount.tsx:37, Login.tsx:91, ResetPassword.tsx:77 — all call a real submit after preventDefault | 0 dead |
| `<button>` without onClick / type=submit (AST-ish scan) | CoachDayNav.tsx:22, ClientActivityView.tsx:64, WorkoutSession.tsx:400, CoachSubscriptionPlans.tsx:126, AdminCoachDetail.tsx:239, CommandPalette.tsx:143 | all **false positives**: the `disabled={date >= …}` / `disabled={idx >= …}` expression contains `>` which truncated the regex; each has `onClick` on the following line (CoachDayNav.tsx:27, ClientActivityView.tsx:69, WorkoutSession.tsx:403, CoachSubscriptionPlans.tsx:131, AdminCoachDetail.tsx:239 same line, CommandPalette.tsx:147) |
| constant `disabled={true|false}` | 0 (only a doc comment SubmitButton.tsx:29) | — |
| Menu items without action | 0 | — |
| Deprecated no-op still wired | Settings.tsx:485 `cloudState.signOut()` → cloudStore.ts:129-131 only `console.warn`s | **real dead button** — S-27 |

---

## (d) QUERY-KEY REGISTRY

Defaults (`src/services/platform/queryClient.ts:14-23`): `staleTime 60_000`, `gcTime 10 min`, `retry 1`, `refetchOnWindowFocus true`. Focus-refetch only fires for queries older than staleTime, so a mutation followed by navigation inside 60 s serves stale cache with no refetch — it masks, not fixes, a missing invalidation. Polls: `['coachPlanRequest','mine']` 60 s (CoachPlanBanner.tsx:28, CoachPlan.tsx:35), `['activeCheckIn',uid]` 60 s (useActiveCheckIn.ts:18), `['clientDay',id,date]` 15 s in CoachViewNutrition.tsx:33 only, `['pendingInvites']` staleTime 0 + refetchOnMount always (CoachClients.tsx:381-386). No `queryClient.clear()` / `removeQueries` anywhere in `src/` (grep) — see S-1.

| Key shape | READ (useQuery) file:line | queryFn → procedure | INVALIDATED/SET by file:line | Mutation(s) | Status |
|---|---|---|---|---|---|
| `['coachNotes', uid]` (client) | ClientNotesProvider.tsx:16 | fetchMyCoachNotes → coachNotes.list | — | — (coach writes in other session) | OK (dup of `myCoachNotes`, S-13) |
| `['coachNotes', clientId]` (coach) | CoachClientDetail.tsx:85, CoachClientNotes.tsx:26, CoachViewLayout.tsx:40 | listCoachNotes → coachNotes.list | CoachClientDetail.tsx:294, CoachClientNotes.tsx:34, CoachViewLayout.tsx:57 | addCoachNote | OK |
| `['myCoachNotes', cid]`, `['myCoachTargets', cid]` | useCoachContent.ts:16-17 | fetchMyCoachNotes / fetchMyCoachTargets | — | — | OK (S-13 dup) |
| `['myFreezeRequest', uid]` | ClientSubscriptionSection.tsx:34 | fetchMyFreezeRequest | :39 | submitFreezeRequest, cancelFreezeRequest | OK |
| `['mySubscription', uid]` | useSubscription.ts:20 | fetchMyRelationship → coachClients.get | — | (coach mutates in other session; focus refetch) | OK |
| `['coachDashboard', coachId]` | ClientSwitcherSheet.tsx:32, CoachClients.tsx:98, CoachDashboard.tsx:30, CoachReports.tsx:23, CoachRevenue.tsx:20; getQueryData CommandHost.tsx:57 | getCoachDashboard (aggregates listMyClients+summaries+relationships+templates+unread) | IncomingTransferRequests.tsx:57, AddExistingClient.tsx:252,275, CoachClientDetail.tsx:56, LoadStarterLibraryButton.tsx:8 | approve transfer, assignExisting, release, seed | **STALE-RISK**: not invalidated by subscription ops (S-4), check-in ops (S-5), assessment review (S-6), client status change (S-11), seeding from CoachExerciseLibrary.tsx:136 (S-12) |
| `['coachDashboardSummaries', coachId]` | CoachAdherence.tsx:31, CoachAssessments.tsx:41 | listClientDashboardSummaries → coachClients.dashboardSummaries | IncomingTransferRequests.tsx:58, AddExistingClient.tsx:253,276, CoachClientDetail.tsx:57 | transfer/assign/release | **STALE-RISK** (S-5, S-6) |
| `['myClients', coachId]` | NotificationBell.tsx:37, CoachAdherence.tsx:24, CoachAssessments.tsx:35, CoachCheckInsOverview.tsx:48, CoachClients.tsx:90, CoachMessages.tsx:50, CoachPlan.tsx:34, CoachTemplatePreview.tsx:32, RoleAccount.tsx:36, Notifications.tsx:71 | listMyClients → coachClients.listMyClientUsers | IncomingTransferRequests.tsx:56, AddExistingClient.tsx:251,274, CoachClientDetail.tsx:55 | same | **STALE-RISK** for CoachSubscriptionPanel `setStatus` (S-11) |
| `['adminCoachClients', coachId]` | AdminCoachDetail.tsx:56 | listMyClients | — | — | **MISMATCH** with admin transfer/assign/unassign (S-10). Divergent spelling from `myClients` is harmless (different session) |
| `['coachPlanRequest','mine']` | CoachPlanBanner.tsx:28, CoachPlan.tsx:35 | getMyPlanRequest | CoachPlan.tsx:45,51,56 | submit/cancel | OK within session; **no uid in key → leak across users (S-1)** |
| `['planRequests','pending']` | useNotifications.ts:48, AdminCoachDetail.tsx:54, AdminCoaches.tsx:71, AdminSubscriptions.tsx:35, OverviewPanel.tsx:29 | listPendingPlanRequests | AdminCoachDetail.tsx:102 | confirm/reject | OK |
| `['coachPlan', coachId]` | CoachPlanProvider.tsx:30, CoachClients.tsx:105, CoachDashboard.tsx:35, CoachPlan.tsx:33, RoleAccount.tsx:34 | getCoachPlan → coachPlans.me | — (admin mutates in other session) | — | OK |
| `['coachPlanAdmin', coachId]` | AdminCoachDetail.tsx:49 | getCoachPlan (→ adminCoaches.detail fallback) | AdminCoachDetail.tsx:65 | tier/extend/renew/cap/ends/acct/confirm/reject | OK; spelling divergence from `coachPlan` harmless (admin vs coach session) |
| `['coachHistory', clientId]` | CoachTimeline.tsx:27 | listClientCoachHistory | — | — | STALE-RISK after release/transfer (S-10) |
| `['incomingTransfers', coachId]` | IncomingTransferRequests.tsx:28 | listIncomingTransferRequests | :55 | approve/reject | OK |
| `['transferReq', meId, clientId]` | AddExistingClient.tsx:243 | getTransferRequest | :262, :267 | submit/cancel request | OK |
| `['pendingTransfers']`, `['pendingTransfers','count']` | AdminAssignments.tsx:78, OverviewPanel.tsx:30 | listPendingTransferRequests | AdminAssignments.tsx:59 (prefix covers both) | transfer wizard, reject | OK |
| `['coachPlans', coachId]` | SubscriptionPlanPicker.tsx:47 (`listCoachPlans(id)`), CoachSubscriptionPanel.tsx:377 (`listCoachPlans(id)`), **CoachSubscriptionPlans.tsx:37 (`listCoachPlans(id, true)`)** | coachAssets.billingPlans.list, archived filtered client-side (coachPlansApi.ts:18) | CoachSubscriptionPlans.tsx:39 | save/delete plan | **COLLISION** — S-2 |
| `['planVersions', clientId, kind]` | PlanVersionHistory.tsx:43 | listVersions | VersionActions.tsx:49, PlanVersionHistory.tsx:54 | saveAsNewVersion, restore | **MISMATCH** with assignWorkoutTemplate (auto-saves a version, coachAssetsApi.ts:150) — S-3 |
| `['clientWorkoutPlan', id]` | AdminClientDetail.tsx:26, ClientActivityView.tsx:33, CoachClientDetail.tsx:90, CoachWorkoutEditor.tsx:38, PlanVersionHistory.tsx:45 | getClientWorkoutPlan | CoachWorkoutEditor.tsx:78, VersionActions.tsx:50, PlanVersionHistory.tsx:55 | save, version save/restore | **MISMATCH** with assignWorkoutTemplate (S-3), updatePlanExerciseFromLibrary (S-16) |
| `['clientMealPlan', id]` | AdminClientDetail.tsx:27, ClientActivityView.tsx:34, CoachClientDetail.tsx:95, CoachNutritionEditor.tsx:75, CoachViewNutrition.tsx:20, PlanVersionHistory.tsx:45 | getClientMealPlan | CoachNutritionEditor.tsx:124, VersionActions.tsx:50, PlanVersionHistory.tsx:56 | save, versions | OK (no nutrition template assign UI exists) |
| `['clientCardioPlan', id]` | AdminClientDetail.tsx:28, CoachCardioEditor.tsx:47, CoachClientDetail.tsx:100, CoachViewCardio.tsx:15, PlanVersionHistory.tsx:45 | getClientCardioPlan | CoachCardioEditor.tsx:96, VersionActions.tsx:50, PlanVersionHistory.tsx:57 | save, versions | OK |
| `['myCardioPlan', uid]` | Cardio.tsx:114 | fetchMyCardioPlan | — | — | OK |
| `['myCoach', coachId]` | CoachInfoCard.tsx:21, NotificationBell.tsx:42, Messages.tsx:17, Notifications.tsx:76 | fetchMyCoach → adminUsers.get | — | — | OK (client session) |
| `['user', clientId]` | useCoachClientHeader.ts:29, AdminClientDetail.tsx:25, CoachClientDetail.tsx:64, CoachClientSubscriptionTab.tsx:15, CoachMessageThread.tsx:19, CoachViewLayout.tsx:39 | fetchUser | CoachSubscriptionPanel.tsx:71 | setStatus | STALE-RISK in admin session after AdminAccounts/AdminMembers status change (only `displayName` rendered at AdminClientDetail.tsx:31 → not visible) — P3 |
| `['coachUser', coachId]` | AdminCoachDetail.tsx:48 | fetchUser | AdminCoachDetail.tsx:66 | all coach-detail mutations | OK; not invalidated by AdminAccounts.refresh (P3) |
| `['exerciseLibrary', coachId]` | ExercisePickerSheet.tsx:39, CoachExerciseLibrary.tsx:91; getQueryData CommandHost.tsx:60 | listExercises | ExercisePickerSheet.tsx:108, CoachExerciseLibrary.tsx:114,136,147,157, LoadStarterLibraryButton.tsx:8 | save/delete/bulk/seed | OK |
| `['workoutTemplates', coachId]` | CoachTemplates.tsx:30; getQueryData CommandHost.tsx:66 | listWorkoutTemplates | CoachExerciseLibrary.tsx:115,136, CoachTemplatePreview.tsx:36, CoachTemplates.tsx:42, CoachWorkoutTemplateEditor.tsx:71, LoadStarterLibraryButton.tsx:8 | exercise save (sync), dup/delete, template save, seed | **MISMATCH** with saveClientPlanAsTemplate (S-8) |
| `['workoutTemplate', coachId, id]` | CoachTemplatePreview.tsx:33, CoachWorkoutTemplateEditor.tsx:37 | getWorkoutTemplate | CoachWorkoutTemplateEditor.tsx:72 | template save | **MISMATCH** with exercise-library sync (S-7) |
| `['coachTemplatesCount', coachId]` | CoachChecklist.tsx:29 | listWorkoutTemplates (same fn as `workoutTemplates`!) | — | — | **MISMATCH** (S-8, S-12) — should just reuse `['workoutTemplates', coachId]` |
| `['foods'/'foodGroups'/'supplements', coachId]` | CoachExerciseLibrary.tsx:271,422-423,536, CoachNutritionEditor.tsx:76-78; getQueryData CommandHost.tsx:63 | listFoods/listFoodGroups/listSupplements | CoachExerciseLibrary.tsx:136,283,288,298,427,432,441,547,552,561, LoadStarterLibraryButton.tsx:8 | save/delete/bulk/seed | OK |
| `['activeCheckIn', uid]`, `['checkIn', uid, id]`, `['checkInsHistory', uid]` | useActiveCheckIn.ts:15, CheckIn.tsx:42, CheckInHistory.tsx:29 | getActiveCheckIn / getCheckIn / listCheckIns | CheckIn.tsx:50-52 | submitCheckIn | OK |
| `['checkIns', clientId]`, `['coachCheckInSummaries', coachId]` | CoachCheckIns.tsx:31, CoachCheckInsOverview.tsx:54 | listCheckIns / listCheckInsForCoachClients | CoachCheckIns.tsx:35-36, CoachCheckInsOverview.tsx:88-89,109-110 | request/review/remind | OK between themselves; **MISMATCH** with dashboard keys (S-5) |
| `['assessment', uid]` (client) | useAssessmentStatus.ts:16, MyAssessment.tsx:39, Progress.tsx:192, Settings.tsx:161 | fetchMyAssessment | AssessmentWizard.tsx:209,241 | submitAssessment | OK |
| `['clientAssessment', id]` (coach/admin) | useCoachClientHeader.ts:31, AdminClientDetail.tsx:29, CoachClientAssessment.tsx:36, CoachClientDetail.tsx:105 | getClientAssessment | CoachClientAssessment.tsx:44 | notes/review/reset | OK; **MISMATCH** with dashboard keys (S-6). Divergence from `assessment` harmless (other session) |
| `['clientProfile', id]` | useCoachClientHeader.ts:30 | fetchClientProfile | — | (profile.save unused) | OK |
| `['relationship', coachId, clientId]` | useCoachClientHeader.ts:32, CoachSubscriptionPanel.tsx:59 | getRelationship | CoachSubscriptionPanel.tsx:69 | subscription ops | OK; not invalidated by release (page navigates away) |
| `['freezeRequest', clientId]` | CoachSubscriptionPanel.tsx:60 | getClientFreezeRequest | :70 | decide | OK |
| `['clientLogs', id, 'workoutLogs', 10]` / `['clientLogs', id, 'weightLogs']` | CoachClientDetail.tsx:75 / :80 + useCoachClientHeader.ts:33 (both limit 1) | fetchClientLogs | — | — | OK (limit encoded where it differs) |
| `['clientDay', id, date]` | ClientActivityView.tsx:32, CoachViewCardio.tsx:16, CoachViewNutrition.tsx:28 (poll 15 s) | fetchClientDay | — | — | OK |
| `['clientMeasurements', id]`, `['clientPhotos', id]`, `['clientWeightLogs', id]` | CoachViewMeasurements.tsx:20, CoachViewProgress.tsx:13 / CoachViewPhotos.tsx:16 / CoachViewProgress.tsx:12 | fetchClientMeasurements / fetchClientPhotos / fetchClientWeightLogs | CoachViewMeasurements.tsx:29 | saveClientMeasurement | OK |
| `['users', filterKey]` | AdminAccounts.tsx:135 | fetchUsersPage | AdminAccounts.tsx:152, AdminCoachDetail.tsx:94, AdminCoaches.tsx:92,113 | status/role/delete/bulk | **MISMATCH** with AdminMembers status (S-9) |
| `['usersByRole', role]` | AdminAssignments.tsx:40-41 | fetchByRole | AdminAccounts.tsx:159, AdminAssignments.tsx:58, AdminCoachDetail.tsx:95, AdminCoaches.tsx:93,114 | | **MISMATCH** with AdminMembers (S-9) |
| `['clientNames']` | AdminMedia.tsx:29 | fetchByRole('client',500) | — | — | OK (P3 dup of usersByRole) |
| `['coachAdmin']`, `['coachAdmin', search]` | AdminAssignments.tsx:128, AdminCoaches.tsx:67, AdminSubscriptions.tsx:34, OverviewPanel.tsx:27; getQueryData CommandHost.tsx:77 | fetchCoachAdmin | AdminAccounts.tsx:160, AdminAssignments.tsx:69, AdminCoachDetail.tsx:67,96, AdminCoaches.tsx:76,88,112 | | OK; **MISMATCH** with AdminMembers (S-9) and AdminPlans tier save (`.tiers`, S-15) |
| `['adminMembers', search]` | AdminMembers.tsx:73 | fetchMembers | AdminAccounts.tsx:161, AdminMembers.tsx:82 | | **MISMATCH** with admin assign/transfer (S-10) |
| `['platformStats']`, `['adminUsage']`, `['adminGrowth']` | AdminAnalytics.tsx:32-34, OverviewPanel.tsx:25,28, AdminSubscriptions.tsx:37 | fetchPlatformStats / fetchUsage / fetchGrowth | AdminAccounts.tsx:153 (stats only) | | OK (aggregates, staleTime 120 s) |
| `['audit', filters]`, `['audit','categoriesSeed']`, `['audit','recent']` | AdminAudit.tsx:42,54, OverviewPanel.tsx:26 | fetchAuditPage | — | (writes are best-effort) | OK |
| `['banners','admin']` | AdminBanners.tsx:44 | listBanners | AdminBanners.tsx:45 (prefix) | save/delete | OK (BannerHost reads directly, not via RQ) |
| `['featureFlags']` | AdminGovernance.tsx:41 | listFlags | :45,:156 | saveFlag | OK |
| `['cdnImages']` | AdminMedia.tsx:24 | listAllImages | — | — | OK |
| `['coachPlanTiers']`, `['coachPlanTiers','all']`, `['coachPlanTiers','coreFeatures']` | AdminCoachDetail.tsx:57, CoachPlan.tsx:36, RoleAccount.tsx:35 / AdminPlans.tsx:54 / :56 | listCoachPlanTiers() / (true) / getCoreFeatures | AdminPlans.tsx:57 (prefix `['coachPlanTiers']` covers all three) | tier save/archive, core features | OK (not a collision: `'all'` is a distinct key) |
| `['publicPlanTiers']`, `['publicPlanTiers','coreFeatures']` | Pricing.tsx:18-19 | getPublicPlanTiers / getCoreFeatures | — | | STALE-RISK 300 s after AdminPlans save (S-15) |
| `['pendingInvites', coachId]` | CoachClients.tsx:378 | listPendingInvites | :405,:411 | create/revoke | OK |
| `['existingClientSearch', term]` | AddExistingClient.tsx:80 | searchClients | — | — | OK |

---

## (e) Mutation → affected-queries matrix

| Mutation (file:line) | Keys invalidated | Keys READ by screens showing that data (not invalidated) | Verdict |
|---|---|---|---|
| Users: status/role/delete/bulk — AdminAccounts.tsx:164-195 → refresh :151-162 | users, platformStats, usersByRole, coachAdmin, adminMembers | `['user',id]` (AdminClientDetail.tsx:25 — only name shown), `['coachUser',id]` (AdminCoachDetail.tsx:48 shows status) | OK / P3 |
| Users: status — AdminMembers.tsx:79-82 | adminMembers | users (AdminAccounts.tsx:135), usersByRole (AdminAssignments.tsx:40-41), coachAdmin, platformStats | **MISMATCH** S-9 |
| Users: coach suspend — AdminCoaches.tsx:85-93, AdminCoachDetail.tsx:86-98 | coachAdmin, users, usersByRole coach (+coachPlanAdmin, coachUser) | adminMembers (rows include coaches? no — clients only), ok | OK |
| Users: create — AdminAccounts.tsx:534-540 → refresh (:380) | as refresh | — | OK |
| Banners — AdminBanners.tsx:48-58 | banners | — | OK |
| Flags — AdminGovernance.tsx:43-45,156 | featureFlags | — | OK |
| Tiers save/archive/core — AdminPlans.tsx:57-91 | coachPlanTiers (prefix) | `['coachAdmin'].tiers` (AdminCoaches.tsx:132, AdminSubscriptions.tsx:54), `['publicPlanTiers']` (Pricing.tsx:18) | **MISMATCH** S-15 (P3) |
| Exercises save/delete/bulk — CoachExerciseLibrary.tsx:110-158, ExercisePickerSheet.tsx:105-110 | exerciseLibrary (+workoutTemplates on save) | `['workoutTemplate', coachId, id]` (CoachTemplatePreview.tsx:33, CoachWorkoutTemplateEditor.tsx:37) after server-side sync | **MISMATCH** S-7 |
| Templates save — CoachWorkoutTemplateEditor.tsx:66-75 | workoutTemplates, workoutTemplate | coachTemplatesCount (CoachChecklist.tsx:29), coachDashboard.templatesCreated | P3 |
| Templates dup/delete/bulk — CoachTemplatePreview.tsx:37-45, CoachTemplates.tsx:40-43 | workoutTemplates | coachTemplatesCount, coachDashboard | P3 |
| Template ASSIGN — AssignTemplate.tsx:28-31 | **none** | clientWorkoutPlan (5 readers), planVersions (PlanVersionHistory.tsx:43) | **MISMATCH** S-3 (P1) |
| Save client plan as template — CoachWorkoutEditor.tsx:170-176 | **none** | workoutTemplates (CoachTemplates.tsx:30), coachTemplatesCount | **MISMATCH** S-8 |
| Foods/groups/supplements — CoachExerciseLibrary.tsx:280-300,425-442,545-562 | matching key | CoachNutritionEditor.tsx:76-78 read same keys | OK |
| Billing plans — CoachSubscriptionPlans.tsx:41-56 | coachPlans | (collision S-2) | see S-2 |
| Notes create — CoachClientDetail.tsx:294, CoachClientNotes.tsx:34, CoachViewLayout.tsx:57 | coachNotes | — | OK |
| Plan requests confirm/reject — AdminCoachDetail.tsx:98-116 | planRequests pending, coachPlanAdmin, coachUser, coachAdmin | — | OK |
| Plan request submit/cancel — CoachPlan.tsx:39-56 | coachPlanRequest mine | — | OK |
| Transfer request submit/cancel — AddExistingClient.tsx:260-268 | transferReq | — | OK |
| Transfer request accept/reject (coach) — IncomingTransferRequests.tsx:53-70 | incomingTransfers, myClients, coachDashboard, coachDashboardSummaries | coachHistory (CoachTimeline.tsx:27), relationship — pages not mounted | OK (+S-28 double `end`) |
| Transfer request reject (admin) / assign / unassign / transfer wizard — AdminAssignments.tsx:57-72,101-121, TransferWizard.tsx:72-77 → onDone :331 | usersByRole client, pendingTransfers, coachAdmin | adminCoachClients (AdminCoachDetail.tsx:56), adminMembers (AdminMembers.tsx:73 coachId column), `['user', clientId]` (assignedCoachId), coachHistory | **MISMATCH** S-10 |
| Subscription request decide/freeze/unfreeze/end/cancel/extend/setTerm/setPrice — CoachSubscriptionPanel.tsx:68-120 | relationship, freezeRequest, user | coachDashboard (rows.subscription, subs, renewals — CoachClients.tsx:98, CoachRevenue.tsx:20, CoachDashboard.tsx:30), mySubscription (other session) | **MISMATCH** S-4 |
| Client account status by coach — CoachSubscriptionPanel.tsx:80-83 | relationship, freezeRequest, user | myClients (CoachClients.tsx:90), coachDashboard.activeClients | **MISMATCH** S-11 |
| Freeze request submit/cancel (client) — ClientSubscriptionSection.tsx:40-48 | myFreezeRequest | — | OK |
| Assign existing / release — AddExistingClient.tsx:248-280, CoachClientDetail.tsx:52-61 | myClients, coachDashboard, coachDashboardSummaries | coachPlan (cap uses real count at CoachClients.tsx:110 → fine), relationship, coachHistory (unmounted) | OK |
| Check-in request/review/remind — CoachCheckIns.tsx:34-37, CoachCheckInsOverview.tsx:85-111 | checkIns, coachCheckInSummaries | coachDashboardSummaries.toReview (CoachAdherence.tsx:31, CoachAssessments.tsx:41), coachDashboard.checkinsToReview/needsAttention (CoachDashboard.tsx:30, CoachClients.tsx:98) | **MISMATCH** S-5 |
| Check-in submit (client) — CheckIn.tsx:47-55 | checkIn, activeCheckIn, checkInsHistory | — | OK |
| Assessment notes/review/reset — CoachClientAssessment.tsx:44-47 | clientAssessment | coachDashboardSummaries.assessment, coachDashboard.pendingAssessments/needsAttention | **MISMATCH** S-6 |
| Assessment submit (client) — AssessmentWizard.tsx:202-215 | assessment | — | OK |
| Plan save workout/nutrition/cardio — CoachWorkoutEditor.tsx:68-86, CoachNutritionEditor.tsx:119-129, CoachCardioEditor.tsx:91-101 | clientWorkoutPlan / clientMealPlan / clientCardioPlan | planVersions (server does NOT auto-version on plain save; VersionActions is explicit) | OK |
| Version save/restore — VersionActions.tsx:46-56, PlanVersionHistory.tsx:51-58 | planVersions + plan key(s) | — | OK |
| Library sync: update-from-library in client plan — PlanBuilder.tsx:185-195 (updatePlanExerciseFromLibrary) | **none** (local state patched) | clientWorkoutPlan (CoachClientDetail.tsx:90; editor baseline) | **MISMATCH** S-16 (P3) |
| Library sync: detach/reconnect in template — PlanBuilder.tsx:192-196 local only, persisted on template save | (template save path) | — | OK |
| Starter seed — CoachExerciseLibrary.tsx:133-141 vs LoadStarterLibraryButton.tsx:8 | 5 asset keys (+coachDashboard only in the button) | coachTemplatesCount; coachDashboard missing in the library-tab path | **MISMATCH** S-12 (P3) |
| Message send/edit/delete/react — MessageThread.tsx:397-563 | n/a (polling, `subscription.patch`) | coachDashboard.unreadMessages (poll-free, staleTime) | OK (poll) |
| Profile update self / avatar — Settings.tsx:277, RoleAccount.tsx:50,110,130 → useSession.updateSelf (sessionStore.ts:164-169) | session store only | coach's own `['coachUser']`/client's `['myCoach']` live in other sessions | OK |
| Profile update by admin | no admin edit-profile mutation exists (only status/role/delete) | — | n/a |
| Invite create/revoke — CoachClients.tsx:388-412 | pendingInvites | — | OK |
| Trial reminders — CoachDashboard.tsx:37 checkTrialExpiry | — | — | inert (S-17) |

---

## (f) Blind-cast table (`as <Type>` on tRPC results)

| Wrapper cast (file:line) | Backend return | Match? |
|---|---|---|
| accountsApi.ts:54 `as Promise<UserPage>` | adminUsers.ts:81 `{ users: PublicUser[], cursor }` | OK (PublicUser ≡ UserRecord field-for-field: api/_lib/types.ts:41-68 vs src/types/index.ts:71-100) |
| accountsApi.ts:59 `as UserRecord` | adminUsers.ts:224-241 — **redacted** for non-related callers (email '', permissions [], featureFlags {}, createdBy '') | shape OK; semantics: `fetchUser` callers must tolerate empty email (IncomingTransferRequests.tsx:47 does) |
| accountsApi.ts:68,79,93 | toPublicUser | OK |
| coachApi.ts:49 `as UserRecord[]`, :69 `as ClientDashboardSummary[]` | coachClients.ts:126 toPublicUser; :143-188 `{clientId, workouts7d, lastActivity, assessment, fullName, toReview}` | OK |
| coachApi.ts:73, clientCoachApi.ts:35 `as UserProfile` | clientProfile.ts:31 `doc.profile` = ClientProfileFields (api/client/_lib/types.ts:22-33) | OK 1:1 |
| coachApi.ts:78, clientCoachApi.ts:39 `as ClientAssessment` | clientProfile.ts:80 `doc.assessment` = ClientAssessmentFields — every section optional, `completionPercentage/completed/completedAt` optional (types.ts:44-62); saveDraft only `$set`s supplied keys (clientProfile.ts:91-96) | **Type lie**: frontend type (src/types/index.ts:353-366) has required sections; readers use `?.` (useCoachClientHeader.ts:36) so no runtime break found — S-21 (P3) |
| planApi.ts:18/36/44 `as WorkoutPlan|MealPlan|CardioPlan` | clientPlans.ts:22-32 passthrough doc minus `_id/clientId` | OK (server stores what the editor saved) |
| planApi.ts:32 `as unknown as Promise<Exercise>` | clientPlans.ts:59-80 returns `{...ex, librarySyncEnabled:true, synced fields}` | OK |
| coachAssetsApi.ts:42 `as Promise<Exercise>` | coachAssets.ts:112-118 `cfg.toPublic` = stripMeta (no coachId/createdAt/updatedAt) | OK (Exercise has none) |
| coachPlanApi.ts:41 `detail.plan as CoachPlan` and :121-123 `as unknown as CoachPlan[]` | adminCoaches.ts:36,151 `CoachPlanDoc` raw (`_id`, no `coachId`; admin/_lib/types.ts:50-61) whereas `coachPlans.me` returns toPublicCoachPlan (`coachId`) | **Mismatch**: `coachId` absent on the admin path. No UI reads `plan.coachId` (AdminCoachDetail reads endsAt/plan/status/maxClients; AdminCoaches rows read plan.maxClients/endsAt/plan) → latent — S-19 (P3) |
| adminCoachesApi.ts:36 `as Promise<CoachAdminData>` (`tiers: CoachPlanTierConfig[]`) | adminCoaches.ts:31 `tiers: CoachPlanTierDoc[]` — has `key` (admin/_lib/types.ts:67) so `tierLabel` works | OK |
| adminMembersApi.ts:35, auditApi.ts:44, foodSearchApi.ts:24 | adminAnalytics.ts:34-47 MembersData, adminAudit.ts:91-103 (explicit field map), foodSearch.ts:28-40 identical interface | OK |
| messagesApi.ts:146,152,159,164,228 `as Message` | messages/_data.ts:74-84 PublicMessage = MessageDoc−_id (+`coachId` extra) | OK (`broadcast` synthesized :47-49) |
| checkInApi.ts:27-30 toCheckIn `as unknown as WeeklyCheckIn` | clientCheckIns.ts:23,29 raw WeeklyCheckInDoc (types.ts:198-218) | OK (id=weekStart) |
| coachApi.ts:40-43 withId → CoachNote/CoachTargets/FreezeRequest/MeasurementLog/ProgressPhoto/logs | clientCoachNotes.ts:19 CoachNoteDoc, :93 CoachTargetsDoc, clientCheckIns.ts:213 FreezeRequestDoc, :176 MeasurementLogDoc, clientLogs.ts:73 `r.data` (ProgressPhoto payload) | OK |
| planVersionsApi.ts:16-19 toVersion | clientPlans.ts:108 PlanVersionDoc (types.ts:107-118) | OK |
| mongoAuth.ts:43,49,56,65,76 `as MongoUserRecord` | auth.ts:102,120,138,158,180 toPublicUser | OK |
| clientCoachApi.ts:48,62 input casts `as unknown as Parameters<…>` (saveDraft/submit) | clientProfile.ts:83-118 zod DraftBody / Section schemas | input-side; not verified statically (BLOCKED) |

---

## (g) Browser storage key inventory (§30)

| Key | Store | Written / read | User-scoped? | Cleared on logout? | Risk |
|---|---|---|---|---|---|
| `forma.sidebarCollapsed` | localStorage (zustand persist) | sidebarStore.ts:17-22 | no (device pref) | no | none |
| `forma:dismissedBanners` | sessionStorage | BannerHost.tsx:14,18,27 | **no** | no (tab session) | P3: user B in same tab doesn't see banner user A dismissed |
| `forma:chunk-reload-attempted` | sessionStorage | ErrorBoundary.tsx:3,34-36; cleared main.tsx:63 | n/a | n/a | none |
| `forma.micPrimed` | localStorage | MessageThread.tsx:492,500 | no | no | none |
| `forma:active:<YYYY-MM-DD>` | localStorage | PresenceTracker.tsx:16-19 | **no** | no | P3: second account on the same device/day never calls `usage.recordActiveDay` → DAU/WAU undercount |
| `gym-tracker/meta:localOwnerUid` | localforage | clientSync.ts:26,47 | is the scope marker | reset by next client login (ClientApp.tsx:87 only) | coach/admin never scoped (they hold no local repo data) — OK |
| `meta:seedVersion` | localforage | bootstrap.ts:42,106 | no | no | none |
| `meta:pullCursorV3:<uid>:<coll>` (+legacy `pullCursorV2:<uid>`, `clientDataMigrated:<uid>` removed only) | localforage | SyncEngine.ts:71-72,177-206; clientSync.ts:45-46 | yes | on owner switch | none |
| `meta:workoutDraft:<clientId>`, `meta:nutritionDraft:<clientId>`, `meta:cardioDraft:<clientId>` | localforage | CoachWorkoutEditor.tsx:36,49,65,76,94; CoachNutritionEditor.tsx:73,101,116,122,132; CoachCardioEditor.tsx:45,64,78,94,104 | **keyed by client only, not coach** | **no** (sessionStore.signOut:134-138 clears nothing; `clearAllLocalData` reset.ts:29 is client Settings only) | P3: after a transfer, Coach B on the same device resumes Coach A's unsaved draft for that client; drafts also survive account switch |
| `meta:workoutTemplateDraft:<templateId>` | localforage | CoachWorkoutTemplateEditor.tsx:34,50,63,69,80 | template ids are per-coach | no | low |
| `meta:assessmentDraft:<uid>` | localforage | AssessmentWizard.tsx:104,123,139,206 | yes | no (uid-scoped) | none |
| `gym-tracker/<repo stores>`, `blobs`, `deletions` | localforage | LocalRepository.ts:14-16, blobStore.ts:8-10, tombstones.ts:16; wiped by reset.ts:7-35 / clientSync.ts:29-43 | client-only; scoped via localOwnerUid | on owner switch | none |
| React Query cache (in-memory) | — | queryClient.ts:8 shared by all apps | keys mostly uid-scoped; **`['coachPlanRequest','mine']`, admin/global keys are not** | **never cleared** (no `queryClient.clear()` in src) | **P1 S-1** |
| Access token | memory only (platformApi.ts:18) | cleared sessionStore.ts:136,150 | yes | yes | none |

Stale selected-ID crash check: no store persists a "selected client id"; `useDay` selected day is in-memory; drafts are looked up by route param so a stale draft cannot crash, only mislead.

---

## (h) FINDINGS

| ID | Sev | file:line | Defect | Proposed fix |
|---|---|---|---|---|
| S-1 | P1 | src/services/auth/sessionStore.ts:134-138 (signOut), :140-157 (refreshAccount→anonymous); CoachPlanBanner.tsx:28, CoachPlan.tsx:35 | React Query cache is never cleared on sign-out (0 hits for `queryClient.clear`/`removeQueries` in src); `['coachPlanRequest','mine']` carries per-coach data under a uid-less key with staleTime 60 s/gcTime 10 min → next coach on the same device sees the previous coach's plan-request banner until the 60 s poll; admin-wide lists (`users`, `coachAdmin`, `adminMembers`, `audit`, `featureFlags`, `cdnImages`…) also persist across accounts | call `queryClient.clear()` in `signOut` and in the anonymous branch of `refreshAccount`; add `uid` to `['coachPlanRequest','mine', uid]` |
| S-2 | P1 | src/pages/coach/CoachSubscriptionPlans.tsx:37 vs SubscriptionPlanPicker.tsx:47, CoachSubscriptionPanel.tsx:377; coachPlansApi.ts:15-20 | Same key `['coachPlans', coachId]` for `listCoachPlans(id)` (archived filtered) and `listCoachPlans(id,true)`; first fetch wins → picker offers archived plans or management page hides them | key the management page as `['coachPlans', coachId, 'all']`; invalidate with prefix `['coachPlans', coachId]` |
| S-3 | P1 | src/components/coach/AssignTemplate.tsx:28-31; coachAssetsApi.ts:147-169 | Assigning a workout template replaces the client's plan (+auto-saves a version) but invalidates nothing; `['clientWorkoutPlan', clientId]` (CoachWorkoutEditor.tsx:38, CoachClientDetail.tsx:90, ClientActivityView.tsx:33, PlanVersionHistory.tsx:45, AdminClientDetail.tsx:26) and `['planVersions', clientId,'workout']` (PlanVersionHistory.tsx:43) stay stale ≤60 s; opening the editor then saving overwrites the just-assigned plan | in `onSuccess`: invalidate `['clientWorkoutPlan', clientId]`, `['planVersions', clientId, 'workout']`, `['coachDashboard', coachId]` |
| S-4 | P2 | src/pages/coach/CoachSubscriptionPanel.tsx:68-72 | setTerm/freeze/unfreeze/end/cancel/extend/setPrice/decide invalidate relationship/freezeRequest/user only; `['coachDashboard', coachId]` (rows.subscription, subs, renewals, revenue — CoachClients.tsx:98, CoachRevenue.tsx:20, CoachDashboard.tsx:30, ClientSwitcherSheet.tsx:32) stale | add `qc.invalidateQueries({ queryKey: ['coachDashboard', coachId] })` to `invalidate()` |
| S-5 | P2 | src/pages/coach/CoachCheckIns.tsx:34-37; CoachCheckInsOverview.tsx:88-89,109-110 | Check-in request/review/remind don't invalidate `['coachDashboardSummaries', coachId]` (toReview — CoachAdherence.tsx:31, CoachAssessments.tsx:41) or `['coachDashboard', coachId]` (checkinsToReview/needsAttention) | add both keys |
| S-6 | P2 | src/pages/coach/CoachClientAssessment.tsx:44 | review/reset/notes invalidate `clientAssessment` only; dashboard `pendingAssessments`/summary `assessment` status stale | add `['coachDashboardSummaries', coachId]`, `['coachDashboard', coachId]` |
| S-7 | P2 | src/pages/coach/CoachExerciseLibrary.tsx:111-115 | Exercise save propagates into templates server-side; `['workoutTemplate', coachId, id]` (CoachTemplatePreview.tsx:33, CoachWorkoutTemplateEditor.tsx:37) not invalidated → editor shows pre-sync fields and a save writes them back | add `qc.invalidateQueries({ queryKey: ['workoutTemplate', coachId] })` (prefix) |
| S-8 | P2 | src/pages/coach/CoachWorkoutEditor.tsx:170-176 | "Save as template" invalidates nothing; `['workoutTemplates', coachId]` (CoachTemplates.tsx:30) and `['coachTemplatesCount', coachId]` (CoachChecklist.tsx:29) stale | invalidate `['workoutTemplates', coachId]`; make CoachChecklist reuse that key (delete `coachTemplatesCount`) |
| S-9 | P2 | src/pages/admin/AdminMembers.tsx:79-82 | Status change invalidates `['adminMembers']` only, violating the cross-family contract documented at accountsApi.ts:19-23; `['users']`, `['usersByRole']`, `['coachAdmin']`, `['platformStats']` stale | mirror AdminAccounts.refresh (:151-162) |
| S-10 | P2 | src/pages/admin/AdminAssignments.tsx:60-72 (+TransferWizard onDone :331) | assign/unassign/transfer/reject invalidate usersByRole client, pendingTransfers, coachAdmin only; `['adminCoachClients', coachId]` (AdminCoachDetail.tsx:56), `['adminMembers']` (coach column), `['user', clientId]` (assignedCoachId), `['coachHistory', clientId]` stale | add `['adminCoachClients']` (prefix), `['adminMembers']`, `['user', client.id]`, `['coachHistory', client.id]` |
| S-11 | P2 | src/pages/coach/CoachSubscriptionPanel.tsx:80-83 | Coach toggling a client's accountStatus invalidates relationship/freezeRequest/user only; `['myClients', coachId]` (CoachClients.tsx:90 status pill) and `['coachDashboard', coachId]` (activeClients) stale | add both keys to that mutation's onSuccess |
| S-12 | P3 | src/pages/coach/CoachExerciseLibrary.tsx:136 vs LoadStarterLibraryButton.tsx:8 | Two divergent seed-invalidation lists (library tab omits `coachDashboard`; both omit `coachTemplatesCount`) | export one `STARTER_KEYS` constant from starterLibraryApi.ts and use it in both |
| S-13 | P3 | src/components/ClientNotesProvider.tsx:16 vs src/hooks/useCoachContent.ts:16 | Same `fetchMyCoachNotes(uid)` cached twice under `['coachNotes', uid]` and `['myCoachNotes', uid]` (2 requests, can disagree ≤60 s) | unify on `['myCoachNotes', uid]` |
| S-14 | P3 | AdminAccounts.tsx:151-162, AdminCoaches.tsx:88-93 | `['user', id]` / `['coachUser', id]` not invalidated on admin status/role change (AdminCoachDetail.tsx:48 shows status) | add `['coachUser']` and `['user']` prefix invalidations to those refreshes. The other Phase-1 spelling divergences (`coachPlan`/`coachPlanAdmin`, `user`/`coachUser`/`myCoach`, `myClients`/`adminCoachClients`, `assessment`/`clientAssessment`, `coachPlanTiers`/`['coachPlanTiers','all']`) are harmless: different sessions or prefix-covered |
| S-15 | P3 | src/pages/admin/AdminPlans.tsx:57 | Tier save/archive/core-features don't invalidate `['coachAdmin']` (`.tiers` labels/pricing — AdminCoaches.tsx:132, AdminSubscriptions.tsx:54) or `['publicPlanTiers']` (Pricing.tsx:18, 300 s) | add both to `invalidate()` |
| S-16 | P3 | src/components/workout/PlanBuilder.tsx:185-195 | `updatePlanExerciseFromLibrary` persists server-side but only patches local state; `['clientWorkoutPlan', clientId]` remains stale and the editor's dirty baseline now disagrees with the server | `qc.setQueryData(['clientWorkoutPlan', clientId], …)` or invalidate after success |
| S-17 | P2 | accountsApi.ts:130 setPermissions; coachApi.ts:307 setCoachTargets (+:301); coachAssetsApi.ts:275-299 nutrition templates; coachTrialApi.ts:24-56 + coachPlanApi.ts:71-77 + notificationsApi.ts:34-36; coachPlanApi.ts:59 createTrialPlan; coachApi.ts:115 saveClientProfile | Missing product interactions behind live backend procedures: no permissions editor (roles.ts:28-30 requires explicit `clients.writeAll` grants), no coach-targets editor although clients consume targets (useCoachContent.ts:17, clientSync.ts:108-116), no nutrition "Save as template"/templates tab; trial-expiry reminders (T-4) run on every dashboard mount (CoachDashboard.tsx:37) and do nothing; `createTrialPlan`/`saveClientProfile` dead | product decision per item; delete `checkTrialExpiry` call + stubs or move reminders to `api/cron/daily-maintenance.ts`; delete dead wrappers |
| S-18 | P3 | see (b) | 42 dead value exports + 10 export-only-internal + 31 unused type exports (full list in (b)); notable: legacy no-op block coachApi.ts:263-297, `listAllCoachPlans` with wrong cast | delete dead exports; drop `export` on internal helpers |
| S-19 | P3 | src/services/platform/coachPlanApi.ts:41,121-123; api/_trpc/routers/adminCoaches.ts:36,151,84 | Admin-path `plan` is raw `CoachPlanDoc` (`_id`) cast to `CoachPlan` (`coachId`); no UI reads `coachId` today | return `toPublicCoachPlan(plan)` from adminCoaches.list/detail |
| S-20 | P3 | src/services/platform/accountsApi.ts:59; api/_trpc/routers/adminUsers.ts:226-241 | `fetchUser` casts a possibly REDACTED user (email '', createdBy '') to `UserRecord`; callers that key on `email` (CoachTimeline, IncomingTransferRequests) get '' for unrelated users | document in wrapper; type as `UserRecord & { redacted?: true }` or return `Pick<>` |
| S-21 | P3 | src/services/platform/clientCoachApi.ts:39, coachApi.ts:78; api/client/_lib/types.ts:44-62; src/types/index.ts:353-366 | `ClientAssessment` declares every section required while the backend stores partial drafts (saveDraft `$set`s only supplied keys, clientProfile.ts:91-96) | make sections optional in the frontend type (or `Partial<ClientAssessment>` on read) |
| S-22 | P3 | src/components/PresenceTracker.tsx:16-19 | `forma:active:<date>` not user-scoped → second account per device/day is never recorded active | key as `forma:active:${uid}:${date}` |
| S-23 | P3 | CoachWorkoutEditor.tsx:36, CoachNutritionEditor.tsx:73, CoachCardioEditor.tsx:45; sessionStore.ts:134-138 | Coach plan drafts keyed by clientId only, never cleared on sign-out; another coach on the same device inherits them after a transfer | key drafts `…Draft:${coachId}:${clientId}`; purge `*Draft:*` meta keys in `signOut` |
| S-24 | P3 | src/components/BannerHost.tsx:14,18,27 | `forma:dismissedBanners` (sessionStorage) not user-scoped | include uid in the key |
| S-25 | P2 | src/pages/experience/Experience.tsx:80,385,426,429,432,435,443,452,455 (routed at AnonymousApp.tsx:12,37) | 9 placeholder `href="#"` links (brand, Exercises, Foods, Templates, Assessments, About, Privacy, Terms) — dead navigation on the public landing | point to real routes/anchors or remove |
| S-26 | P3 | src/services/platformApi.ts:36-53 | `auth.refresh` reached only via raw fetch — invisible to `trpc.*` call inventories; Phase 1 mis-classed it as test-only | note in router docs; keep (recursion guard is deliberate) |
| S-27 | P2 | src/pages/Settings.tsx:485 → src/services/auth/cloudStore.ts:129-131 | Client Settings "Sign out" button calls the deprecated `useCloud.signOut()` which only `console.warn`s — the user is NOT signed out | call `useSession.getState().signOut()` (as AccountPending.tsx:37 / RoleAccount.tsx:60 do) |
| S-28 | P2 (BLOCKED FROM STATIC) | src/components/coach/IncomingTransferRequests.tsx:61-65; transferApi.ts:104-108 | Approve calls `resolveTransferRequest(accepted)` (server runs `transferClientWithMode`, which already ends the old relationship) and then `releaseClient` → second `coachClients.end` on an already-ended relationship; outcome (error toast after a successful transfer, or endReason flipped from `transferred` to `released`) depends on backend `end` semantics | verify `coachClients.end` on an ended rel; drop the `releaseClient` call if the server transfer already releases |
