# Phase 1 — Coach Onboarding & Client Invites · Implementation Summary

Built in an isolated git worktree (branch `phase1-coach-onboarding`). Delivered as **`docs/phase1-coach-onboarding.patch`** (applies cleanly to current `main`). **Not yet applied to your working tree** — review, then apply.

## How to apply & verify
```bash
# from D:\Gym
git checkout -b phase1-coach-onboarding        # optional: isolate
git apply docs/phase1-coach-onboarding.patch    # dry-run verified clean
npm run lint && npm run build                    # both pass (verified)
firebase deploy --only firestore:rules           # required: new collections + gates
npx playwright test e2e/coach-signup.spec.ts e2e/client-invite.spec.ts e2e/security.spec.ts
# optional, after deploy, against a staging project:
node scripts/backfill-coach-plans.mjs --dry-run  # gives existing coaches a trial plan
```

## What shipped (additive; security model preserved)
- **Coach/Client role chooser** on signup. Client flow unchanged. Coach → `role:coach, accountStatus:active, createdBy:self` (`provisionSelfCoach`).
- **Auto trial plan** in new `coachPlans/{coachId}`: `plan:trial, status:active, maxClients:10, durationDays:15, endsAt:+15d`. New `coachPlanApi.ts`.
- **Simple 3-item checklist** (Complete profile / Add first client / Create first template) on the coach dashboard, derived from real data. No big wizard.
- **Client invites**: new `signupInvites/{code}`, coach generates/copies/revokes a link (`/invite/:code`); public `AcceptInvite` page → visitor sets password → account created → single-use claim → auto-assigned to coach. `inviteApi.ts`.
- **maxClients gate**: `N / max used` UI, create/invite disabled at cap; server-side guard in rules via `coachPlans.activeClientCount` (maintained in `coachClientsApi`); `reconcile-client-counts.mjs` for drift.
- **Trial-expiry notifications** at 7/3/1 days (coach foreground check; once-each via `trialNotified`), plus a dashboard trial banner. `coachTrialApi.ts`.
- **firestore.rules**: widened self-provision for coach; `coachPlans` + `signupInvites` rules; invite-driven self-assignment; cap enforced on `coachClients` create. Other boundaries untouched.
- **i18n** EN + AR in sync (1138 keys each). **Backfill** script delivered (not run).
- **E2E**: `coach-signup`, `client-invite` specs + 8 security negatives + `createInvite()/claimInvite()` fixtures.

## Verified vs. not
- ✅ `npm run lint` (tsc) and `npm run build` pass; rules compile (emulator boot); e2e specs type-check; patch applies clean.
- ⚠️ **Not runtime-tested** here (sandbox has no Playwright browsers / live Firebase). Run the e2e suite against the emulator or a staging project before production deploy.

## Two production caveats (inherent to the no-Cloud-Functions design)
1. **`maxClients` is a soft guard.** `activeClientCount` is incremented client-side and is owner-writable, so a technically capable coach could reset it to bypass the cap. Hardening options: a Cloud Function, or a rules `getAfter()` batch check that the same write increments the counter. Matches Forma's existing "best-effort audit logs" trade-off.
2. **Invite docs are publicly readable by code** (`allow get: if true`) so the pre-auth claim screen can show the coach name. The code is a random capability (no `list`), but any pre-filled invitee email/phone on the invite is visible to a link-holder — avoid storing client PII on invites, or accept it (the link goes to that client).

## Next
Phase 2 (client subscription states + access gating + plan selection on client create) builds directly on this. Recommend: run the e2e suite green against the emulator, decide on counter hardening, then proceed.
