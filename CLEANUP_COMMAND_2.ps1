# Forma cleanup, round 2 — run from D:\Gym.
#
# Root cause of why 4 files survived the first cleanup script: PowerShell's
# Remove-Item -Path treats square brackets as WILDCARD characters, even inside
# quoted strings. "api\banners\[id].ts" was silently parsed as a pattern
# matching "i.ts" or "d.ts" (neither exists) instead of the literal filename,
# so the delete was a silent no-op for every bracket-named path. This script
# uses -LiteralPath instead, which disables wildcard parsing entirely.
#
# Also found one file that was missed in the original migration: api/client/profile.ts
# was never included in the api/client consolidation — it's now been added to
# api/client/_handlers/profile.ts and wired into api/client/[...path].ts, so the
# original is safe to delete.

Remove-Item -LiteralPath `
  "api\banners\[id].ts", `
  "api\coach-clients\[id].ts", `
  "api\coach-plans\[coachId].ts", `
  "api\client\profile.ts" `
  -Force

Write-Host "Round 2 cleanup complete. Now run: npm run build" -ForegroundColor Green
