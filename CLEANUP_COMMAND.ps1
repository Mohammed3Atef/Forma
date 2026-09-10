# Forma cleanup: run from D:\Gym after `npm run build` passes with zero errors.
# Deletes: (1) confirmed-dead files/tests, (2) every old leaf api/ route file now
# superseded by the 9 catch-all routers (api/**/[...path].ts, [[...path]].ts).

# --- Whole directories (fully superseded / fully dead) ---
Remove-Item -Recurse -Force `
  e2e, `
  api\invites, `
  api\transfers, `
  api\plan-tiers, `
  api\notifications, `
  api\usage, `
  api\flags, `
  api\admin\coaches, `
  api\admin\users, `
  api\client\logs, `
  api\sync\deletions, `
  "api\coach-assets\billing-plans", `
  "api\coach-assets\exercises", `
  "api\coach-assets\food-groups", `
  "api\coach-assets\foods", `
  "api\coach-assets\nutrition-templates", `
  "api\coach-assets\supplements", `
  "api\coach-assets\workout-templates"

# --- Individual dead/misc files ---
Remove-Item -Force playwright.config.ts, scripts\qa-report.mjs, docs\QA_REPORT.md
Remove-Item -Force android\app\src\main\assets\public\assets\firebaseAuth-DmYp_rsv.js

# --- Individual old route files (now served by the 9 catch-all routers) ---
Remove-Item -Force `
  api\auth\signup.ts, `
  api\auth\login.ts, `
  api\auth\refresh.ts, `
  api\auth\logout.ts, `
  api\auth\me.ts, `
  api\auth\update-profile.ts, `
  api\auth\change-password.ts, `
  api\auth\request-password-reset.ts, `
  api\auth\confirm-password-reset.ts, `
  api\admin\stats.ts, `
  api\admin\members.ts, `
  api\admin\growth.ts, `
  api\admin\coaches.ts, `
  api\admin\audit.ts, `
  api\client\assessment.ts, `
  api\client\workout-plan.ts, `
  api\client\nutrition-plan.ts, `
  api\client\cardio-plan.ts, `
  api\client\coach-notes.ts, `
  api\client\coach-targets.ts, `
  api\client\check-ins.ts, `
  api\client\measurements.ts, `
  api\client\subscription-request.ts, `
  api\client\plan-versions.ts, `
  api\client\settings.ts, `
  api\client\notifications.ts, `
  api\coach-assets\billing-plans.ts, `
  api\coach-assets\exercises.ts, `
  api\coach-assets\food-groups.ts, `
  api\coach-assets\foods.ts, `
  api\coach-assets\nutrition-templates.ts, `
  api\coach-assets\supplements.ts, `
  api\coach-assets\workout-templates.ts, `
  api\coach-assets\seed-starter-library.ts, `
  api\coach-clients\index.ts, `
  "api\coach-clients\[id].ts", `
  api\coach-plans\me.ts, `
  api\coach-plans\trial.ts, `
  api\coach-plans\change-request.ts, `
  api\coach-plans\admin-plan-change-requests.ts, `
  "api\coach-plans\[coachId].ts", `
  api\messages\index.ts, `
  api\messages\mark-read.ts, `
  api\banners\index.ts, `
  "api\banners\[id].ts", `
  api\banners\for-viewer.ts, `
  api\sync\push.ts, `
  api\sync\pull.ts, `
  api\sync\singleton.ts, `
  api\sync\wipe.ts

Write-Host "Cleanup complete. Now run: npm run build" -ForegroundColor Green
