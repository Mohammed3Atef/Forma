# Forma — Automated QA Report

_Generated 2026-06-16T12:58:50.808Z from `test-results/results.json`_

## Summary

| Result | Count | |
|---|---:|---|
| ✅ Passed | 94 | ███████████████░░░░░ |
| ❌ Failed | 7 | █░░░░░░░░░░░░░░░░░░░ |
| ⏭️ Skipped | 24 | ████░░░░░░░░░░░░░░░░ |
| **Total** | **125** | |

Run duration: 324.9s

## Recommended fix priority

### 🔴 Critical (0)

_None._

### 🟠 High (2)

- **[Firestore schema]** `data-integrity.spec.ts` — coachClients relationship exists and is active
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).
- **[Firestore schema]** `data-integrity.spec.ts` — clientData/{id}/plan/{workout,nutrition,cardio} all exist
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

### 🟡 Medium (1)

- **[UI / UX]** `ui-coverage.spec.ts` — login screen renders cleanly
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

### ⚪ Low (4)

- **[Other]** `food-alternatives.spec.ts` — coach creates a food and an alternatives group
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).
- **[Other]** `plan-versions.spec.ts` — coach saves V1
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).
- **[Other]** `preflight.spec.ts` — coach: can authenticate against Firebase directly
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).
- **[Other]** `workout-templates.spec.ts` — creates a workout template (day → section → exercise)
  - FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

## Findings by category

### Firestore schema (2) — priority: High

<details><summary><code>data-integrity.spec.ts</code> — coachClients relationship exists and is active</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\data-integrity.spec.ts:56:15
```
</details>

<details><summary><code>data-integrity.spec.ts</code> — clientData/{id}/plan/{workout,nutrition,cardio} all exist</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\data-integrity.spec.ts:31:17
```
</details>

### UI / UX (1) — priority: Medium

<details><summary><code>ui-coverage.spec.ts</code> — login screen renders cleanly</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\ui-coverage.spec.ts:18:17
```
</details>

### Other (4) — priority: Low

<details><summary><code>food-alternatives.spec.ts</code> — coach creates a food and an alternatives group</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\food-alternatives.spec.ts:29:17
```
</details>

<details><summary><code>plan-versions.spec.ts</code> — coach saves V1</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\plan-versions.spec.ts:20:17
```
</details>

<details><summary><code>preflight.spec.ts</code> — coach: can authenticate against Firebase directly</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\preflight.spec.ts:45:17
```
</details>

<details><summary><code>workout-templates.spec.ts</code> — creates a workout template (day → section → exercise)</summary>

```
FirebaseError: Firebase: Exceeded quota for verifying passwords. (auth/quota-exceeded).

   at fixtures\firestore.ts:72

  70 |   const auth = getAuth(app);
  71 |   const db = getFirestore(app);
> 72 |   const cred = await signInWithEmailAndPassword(auth, email, password);
     |                ^
  73 |   return {
  74 |     app,
  75 |     auth,
    at _errorWithCustomMessage (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\util\assert.ts:100:18)
    at _performFetchWithErrorHandling (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:241:15)
    at _performSignInRequest (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\api\index.ts:264:26)
    at _signInWithCredential (D:\Gym\node_modules\firebase\node_modules\@firebase\auth\src\core\strategies\credential.ts:44:20)
    at signInWith (D:\Gym\e2e\fixtures\firestore.ts:72:16)
    at D:\Gym\e2e\workout-templates.spec.ts:31:17
```
</details>

## Skipped tests

- `data-integrity.spec.ts` — coach-created data is STRUCTURED (not stored as notes only)
- `data-integrity.spec.ts` — coach targets stored at clientData/{id}/coachTargets/current
- `data-integrity.spec.ts` — client logs are written under clientData/{clientId}
- `data-integrity.spec.ts` — coach-driven flow does NOT use legacy users/{uid}/workoutPlans
- `food-alternatives.spec.ts` — client swaps a planned food for an approved alternative; the plan is untouched
- `food-alternatives.spec.ts` — coach activity shows the substitution with its adherence tag
- `plan-versions.spec.ts` — coach saves V2 (V1 deactivated, plan mirrors V2)
- `plan-versions.spec.ts` — client sees the active version (V2)
- `plan-versions.spec.ts` — coach restores V1 → client plan reverts
- `plan-versions.spec.ts` — client sees the restored plan (V1)
- `ui-coverage.spec.ts` — client route: client-home
- `ui-coverage.spec.ts` — client route: client-workout
- `ui-coverage.spec.ts` — client route: client-nutrition
- `ui-coverage.spec.ts` — client route: client-cardio
- `ui-coverage.spec.ts` — client route: client-progress
- `ui-coverage.spec.ts` — client route: client-settings
- `ui-coverage.spec.ts` — coach static routes
- `ui-coverage.spec.ts` — coach client detail + editors
- `ui-coverage.spec.ts` — admin routes
- `workout-templates.spec.ts` — template persisted under coachAssets/workoutTemplates
- `workout-templates.spec.ts` — assigning the template writes an INDEPENDENT snapshot with meta
- `workout-templates.spec.ts` — editing the assigned plan flips isCustomized and leaves the template UNCHANGED
- `workout-templates.spec.ts` — editing the template later does NOT change the already-assigned plan
- `workout-templates.spec.ts` — client sees the assigned sectioned plan and CANNOT edit it

## Passed tests

<details><summary>Show all passing tests</summary>

- `admin.spec.ts` — lands on /admin
- `admin.spec.ts` — can view accounts
- `admin.spec.ts` — can filter to coaches and clients
- `admin.spec.ts` — can open a client detail read-only
- `admin.spec.ts` — can view analytics if allowed
- `admin.spec.ts` — can view audit logs if allowed
- `admin.spec.ts` — create form does NOT offer admin/super_admin roles (no self-promotion)
- `admin.spec.ts` — cannot edit a super_admin account (UI blocks it)
- `admin.spec.ts` — rules BLOCK: admin cannot promote a user to super_admin
- `admin.spec.ts` — rules BLOCK: admin cannot write a client workout plan (no clients.writeAll)
- `admin.spec.ts` — rules ALLOW: admin can read a client identity doc (oversight)
- `assessment.spec.ts` — client walks the wizard, saves a draft, then submits
- `assessment.spec.ts` — coach sees the submitted assessment and marks it reviewed
- `assessment.spec.ts` — admin can read the assessment but cannot write it
- `assessment.spec.ts` — client cannot edit a reviewed assessment
- `assessment.spec.ts` — coach reset re-opens the assessment for the client
- `client-assigned.spec.ts` — sees the assigned workout plan (not the waiting state)
- `client-assigned.spec.ts` — workout plan persisted with the exact coach-set set counts (warm-up-only + working-only)
- `client-assigned.spec.ts` — opens a routine and sees rest time, video and instructions
- `client-assigned.spec.ts` — can start a workout, log a set (weight × reps), and finish
- `client-assigned.spec.ts` — sees the assigned nutrition plan + coach targets
- `client-assigned.spec.ts` — can mark a meal eaten and log water
- `client-assigned.spec.ts` — sees the assigned cardio plan and can log activity
- `client-assigned.spec.ts` — cardio plan + targets persisted as coach set them
- `client-assigned.spec.ts` — can view the coach note
- `client-empty.spec.ts` — logs in with coach-created credentials and lands on the client app
- `client-empty.spec.ts` — home shows "waiting for your coach" and no plan
- `client-empty.spec.ts` — workout + nutrition pages show the waiting empty-state
- `client-empty.spec.ts` — no legacy seed data / no hardcoded Mohamed profile
- `client-empty.spec.ts` — targets are blank/zero (no stale coach targets)
- `client-empty.spec.ts` — profile is dynamic (not the hardcoded legacy values)
- `coach-library-plan.spec.ts` — coach adds a library exercise into a client plan (deep copy)
- `coach-library-plan.spec.ts` — editing the library exercise does NOT change the client plan copy
- `coach-library.spec.ts` — opens the Library from the bottom nav
- `coach-library.spec.ts` — creates an exercise in the library (with a quick preset)
- `coach-library.spec.ts` — library exercise persisted under coachAssets with preset values
- `coach-library.spec.ts` — search filters the library
- `coach-library.spec.ts` — edits an existing library exercise
- `coach-library.spec.ts` — deletes a library exercise
- `coach.spec.ts` — lands on /coach and shows the clients list
- `coach.spec.ts` — creates a client (name + email + temp password); active + auto-assigned
- `coach.spec.ts` — opens the created client detail
- `coach.spec.ts` — authors a full workout plan via the drill-down builder (day → section → exercise)
- `coach.spec.ts` — authors a nutrition plan (meals, foods, macros, targets, water)
- `coach.spec.ts` — authors a cardio plan (sessions: type, duration, frequency, notes)
- `coach.spec.ts` — sets coach targets (steps / cardio / water)
- `coach.spec.ts` — adds a coach note
- `coach.spec.ts` — can view client activity
- `coach.spec.ts` — cannot reach admin pages (redirected back to coach)
- `coach.spec.ts` — coach nav has no admin/governance tabs
- `coach.spec.ts` — rules BLOCK: coach cannot read an unassigned client clientData
- `coach.spec.ts` — rules BLOCK: coach cannot change a user role
- `data-integrity.spec.ts` — users/{uid} has correct role + accountStatus
- `offline.spec.ts` — log offline → reload offline → data persists → reconnect syncs; no seed data returns
- `preflight.spec.ts` — all required env vars are present
- `preflight.spec.ts` — Firebase web config is loaded
- `preflight.spec.ts` — app boots and initialises Firebase (shows the login screen)
- `preflight.spec.ts` — super_admin: can authenticate against Firebase directly
- `preflight.spec.ts` — super_admin: identity doc has the correct role + active status
- `preflight.spec.ts` — admin: can authenticate against Firebase directly
- `preflight.spec.ts` — admin: identity doc has the correct role + active status
- `preflight.spec.ts` — coach: identity doc has the correct role + active status
- `preflight.spec.ts` — client: can authenticate against Firebase directly
- `preflight.spec.ts` — client: identity doc has the correct role + active status
- `preflight.spec.ts` — rules ALLOW: a user can read their own identity doc
- `preflight.spec.ts` — rules BLOCK: a client cannot list all users
- `preflight.spec.ts` — rules ALLOW: an admin can list users
- `rtl.spec.ts` — switch to Arabic → dir=rtl, nav works, no layout break; switch back → ltr
- `security.spec.ts` — client cannot read another client clientData
- `security.spec.ts` — client cannot edit a coach-owned workout plan (even their own)
- `security.spec.ts` — client cannot edit a coach-owned nutrition plan
- `security.spec.ts` — client cannot edit a coach-owned cardio plan
- `security.spec.ts` — coach cannot access an unassigned client
- `security.spec.ts` — coach cannot change roles
- `security.spec.ts` — coach cannot read admin audit logs
- `security.spec.ts` — admin cannot edit client plans (no clients.writeAll)
- `security.spec.ts` — admin cannot modify a super_admin account
- `security.spec.ts` — unauthenticated direct Firestore calls are denied
- `security.spec.ts` — unauthenticated user cannot access protected routes (sees login)
- `security.spec.ts` — suspended user is blocked
- `security.spec.ts` — pending self-signup user is blocked
- `super-admin.spec.ts` — lands on /admin with the mobile admin dashboard
- `super-admin.spec.ts` — overview shows platform stats tiles
- `super-admin.spec.ts` — can open Accounts and see the create control
- `super-admin.spec.ts` — create coach A, coach B and a client
- `super-admin.spec.ts` — can create an admin (super-admin-only role)
- `super-admin.spec.ts` — suspend then reactivate the client account
- `super-admin.spec.ts` — can change allowed roles for an account
- `super-admin.spec.ts` — assign the client to coach A
- `super-admin.spec.ts` — transfer the client from coach A to coach B
- `super-admin.spec.ts` — can view audit logs (governance)
- `super-admin.spec.ts` — can view analytics
- `super-admin.spec.ts` — can open a client detail (read-only oversight)
- `super-admin.spec.ts` — sees governance / feature-flag screen (super-admin only)

</details>

## Artifacts

Screenshots / video / traces for failures are under `test-results/artifacts/` (open traces with `npx playwright show-trace <trace.zip>`). (18 artifact folders found.)
