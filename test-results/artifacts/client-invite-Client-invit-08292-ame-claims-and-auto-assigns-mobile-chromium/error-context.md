# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: client-invite.spec.ts >> Client invites >> public /invite/:code reveals coach name, claims, and auto-assigns
- Location: e2e\client-invite.spec.ts:39:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('nav-home')
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByTestId('nav-home')

```

```yaml
- banner:
  - text: Forma Step 1 of 8
  - heading "Basic information" [level=1]
  - paragraph: Tell us a little about yourself.
  - button "Save progress"
- main:
  - text: Full name
  - textbox: QA Invitee
  - text: Date of birth
  - textbox
  - text: Gender
  - button "Male"
  - button "Female"
  - text: Height (cm)
  - textbox
  - text: Weight (kg)
  - textbox
- contentinfo:
  - button "Next" [disabled]
```

# Test source

```ts
  1   | import { test, expect } from "./fixtures/test";
  2   | import { TID } from "./fixtures/selectors";
  3   | import {
  4   |   signInAs,
  5   |   signInWith,
  6   |   findCoachClientRel,
  7   |   readDoc,
  8   |   attempt,
  9   |   isPermissionDenied,
  10  |   doc,
  11  |   setDoc,
  12  | } from "./fixtures/firestore";
  13  | import { createInvite, claimInvite, uniqueEmail } from "./fixtures/factory";
  14  | 
  15  | /**
  16  |  * CLIENT INVITES (Phase 1). A coach generates a single-use invite; a visitor
  17  |  * claims it at /invite/:code, sets a password, is auto-assigned, and shows up in
  18  |  * the coach's clients. Also covers single-use + expiry enforcement (rules).
  19  |  */
  20  | test.describe("Client invites", () => {
  21  |   test("coach generates an invite, copies the link, and can revoke it (UI)", async ({
  22  |     login,
  23  |     page,
  24  |   }) => {
  25  |     await login("coach");
  26  |     await page.goto("/coach/clients");
  27  |     await page.getByTestId(TID.coachAddClient).click();
  28  |     // Redesigned Add-Client dialog: choose "Create New Client" to reach the invite panel.
  29  |     await page.getByTestId(TID.addChooseCreate).click();
  30  |     await expect(page.getByTestId(TID.coachInvitePanel)).toBeVisible();
  31  |     await page.getByTestId(TID.coachInviteGenerate).click();
  32  |     const row = page.getByTestId(TID.coachInviteRow).first();
  33  |     await expect(row).toBeVisible({ timeout: 15_000 });
  34  |     // Copy + revoke controls present.
  35  |     await expect(row.getByTestId(TID.coachInviteCopy)).toBeVisible();
  36  |     await row.getByTestId(TID.coachInviteRevoke).click();
  37  |   });
  38  | 
  39  |   test("public /invite/:code reveals coach name, claims, and auto-assigns", async ({
  40  |     page,
  41  |   }) => {
  42  |     const coach = await signInAs("coach");
  43  |     const invite = await createInvite(coach, {});
  44  |     await coach.close();
  45  | 
  46  |     await page.goto(`/invite/${invite.code}`);
  47  |     await expect(page.getByTestId(TID.acceptInvite)).toBeVisible({
  48  |       timeout: 20_000,
  49  |     });
  50  |     await expect(page.getByTestId(TID.inviteForm)).toBeVisible();
  51  |     // Only the coach display name is revealed (no PII assertion beyond presence).
  52  |     await expect(page.getByTestId(TID.inviteCoachName)).toBeVisible();
  53  | 
  54  |     const email = uniqueEmail("qa-invitee");
  55  |     const password = "Invitee123456!";
  56  |     await page.getByTestId(TID.inviteName).fill("QA Invitee");
  57  |     await page.getByTestId(TID.inviteEmail).fill(email);
  58  |     await page.getByTestId(TID.invitePhone).fill("+15553334444");
  59  |     await page.getByTestId(TID.invitePassword).fill(password);
  60  |     await page.getByTestId(TID.inviteConfirm).fill(password);
  61  |     await page.getByTestId(TID.inviteSubmit).click();
  62  | 
  63  |     // Lands in the client app (assigned → no waiting-for-coach is fine either way).
> 64  |     await expect(page.getByTestId(TID.navItem("home"))).toBeVisible({
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  65  |       timeout: 30_000,
  66  |     });
  67  | 
  68  |     // The relationship + assignment exist; the invite is now claimed (single-use).
  69  |     const sess = await signInWith(email, password, "qa-invitee-read");
  70  |     const rel = await findCoachClientRel(sess.db, invite.coachId, sess.uid);
  71  |     expect(
  72  |       rel,
  73  |       "coachClients relationship should exist after claim",
  74  |     ).not.toBeNull();
  75  |     expect(rel!.status).toBe("active");
  76  |     const sub = (rel as { subscription?: { status?: string } }).subscription;
  77  |     expect(sub, "claimed client has a subscription state").toBeTruthy();
  78  |     expect(sub!.status, "invited client defaults to trial").toBe("trial");
  79  |     const me = await readDoc<{ assignedCoachId?: string }>(sess.db, [
  80  |       "users",
  81  |       sess.uid,
  82  |     ]);
  83  |     expect(me!.assignedCoachId).toBe(invite.coachId);
  84  |   });
  85  | 
  86  |   test("a claimed invite cannot be reused (rules)", async () => {
  87  |     const coach = await signInAs("coach");
  88  |     const invite = await createInvite(coach, {});
  89  |     await coach.close();
  90  | 
  91  |     // First claim succeeds (via the SDK factory, mirroring AcceptInvite).
  92  |     await claimInvite(invite, {
  93  |       email: uniqueEmail("qa-reuse-1"),
  94  |       password: "Reuse123456!",
  95  |       displayName: "QA Reuse 1",
  96  |     });
  97  | 
  98  |     // Any other signed-in client attempting to re-claim the now-`claimed` invite
  99  |     // is denied (the claim branch only permits pending → claimed).
  100 |     const client = await signInAs("client");
  101 |     try {
  102 |       const r = await attempt(() =>
  103 |         setDoc(
  104 |           doc(client.db, "signupInvites", invite.code),
  105 |           {
  106 |             status: "claimed",
  107 |             claimedByUid: client.uid,
  108 |             claimedAt: Date.now(),
  109 |           },
  110 |           { merge: true },
  111 |         ),
  112 |       );
  113 |       expect(
  114 |         isPermissionDenied(r),
  115 |         `re-claiming a claimed invite should be denied (got ${r.code ?? "ok"})`,
  116 |       ).toBe(true);
  117 |     } finally {
  118 |       await client.close();
  119 |     }
  120 |   });
  121 | 
  122 |   test("a forged/unknown invite code cannot attach a client to a coach (rules)", async () => {
  123 |     const coach = await signInAs("coach");
  124 |     const coachId = coach.uid;
  125 |     await coach.close();
  126 |     // An existing client (already assigned to their own coach) cannot self-create
  127 |     // a NEW relationship to an arbitrary coach without a valid pending invite.
  128 |     const client = await signInAs("client");
  129 |     try {
  130 |       const fakeRel = `${coachId}__${client.uid}`;
  131 |       const r = await attempt(() =>
  132 |         setDoc(doc(client.db, "coachClients", fakeRel), {
  133 |           id: fakeRel,
  134 |           coachId,
  135 |           clientId: client.uid,
  136 |           status: "active",
  137 |           createdBy: client.uid,
  138 |           inviteCode: "FORGED99",
  139 |           createdAt: Date.now(),
  140 |           updatedAt: Date.now(),
  141 |         }),
  142 |       );
  143 |       expect(
  144 |         isPermissionDenied(r),
  145 |         `forging a relationship without a valid invite should be denied (got ${r.code ?? "ok"})`,
  146 |       ).toBe(true);
  147 |     } finally {
  148 |       await client.close();
  149 |     }
  150 |   });
  151 | 
  152 |   test("an expired invite is not claimable (rules deny + UI shows invalid)", async ({
  153 |     page,
  154 |   }) => {
  155 |     const coach = await signInAs("coach");
  156 |     const invite = await createInvite(coach, { expiresAt: Date.now() - 1000 });
  157 |     await coach.close();
  158 |     // UI: invalid screen.
  159 |     await page.goto(`/invite/${invite.code}`);
  160 |     await expect(page.getByTestId(TID.inviteInvalid)).toBeVisible({
  161 |       timeout: 20_000,
  162 |     });
  163 |   });
  164 | });
```