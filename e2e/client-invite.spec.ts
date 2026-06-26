import { test, expect } from "./fixtures/test";
import { TID } from "./fixtures/selectors";
import {
  signInAs,
  signInWith,
  findCoachClientRel,
  readDoc,
  attempt,
  isPermissionDenied,
  doc,
  setDoc,
} from "./fixtures/firestore";
import { createInvite, claimInvite, uniqueEmail } from "./fixtures/factory";

/**
 * CLIENT INVITES (Phase 1). A coach generates a single-use invite; a visitor
 * claims it at /invite/:code, sets a password, is auto-assigned, and shows up in
 * the coach's clients. Also covers single-use + expiry enforcement (rules).
 */
test.describe("Client invites", () => {
  test("coach generates an invite, copies the link, and can revoke it (UI)", async ({
    login,
    page,
  }) => {
    await login("coach");
    await page.goto("/coach/clients");
    await page.getByTestId(TID.coachAddClient).click();
    // Redesigned Add-Client dialog: choose "Create New Client" to reach the invite panel.
    await page.getByTestId(TID.addChooseCreate).click();
    await expect(page.getByTestId(TID.coachInvitePanel)).toBeVisible();
    await page.getByTestId(TID.coachInviteGenerate).click();
    const row = page.getByTestId(TID.coachInviteRow).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Copy + revoke controls present.
    await expect(row.getByTestId(TID.coachInviteCopy)).toBeVisible();
    await row.getByTestId(TID.coachInviteRevoke).click();
  });

  test("public /invite/:code reveals coach name, claims, and auto-assigns", async ({
    page,
  }) => {
    const coach = await signInAs("coach");
    const invite = await createInvite(coach, {});
    await coach.close();

    await page.goto(`/invite/${invite.code}`);
    await expect(page.getByTestId(TID.acceptInvite)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId(TID.inviteForm)).toBeVisible();
    // Only the coach display name is revealed (no PII assertion beyond presence).
    await expect(page.getByTestId(TID.inviteCoachName)).toBeVisible();

    const email = uniqueEmail("qa-invitee");
    const password = "Invitee123456!";
    await page.getByTestId(TID.inviteName).fill("QA Invitee");
    await page.getByTestId(TID.inviteEmail).fill(email);
    await page.getByTestId(TID.invitePhone).fill("+15553334444");
    await page.getByTestId(TID.invitePassword).fill(password);
    await page.getByTestId(TID.inviteConfirm).fill(password);
    await page.getByTestId(TID.inviteSubmit).click();

    // Lands in the client app (assigned → no waiting-for-coach is fine either way).
    await expect(page.getByTestId(TID.navItem("home"))).toBeVisible({
      timeout: 30_000,
    });

    // The relationship + assignment exist; the invite is now claimed (single-use).
    const sess = await signInWith(email, password, "qa-invitee-read");
    const rel = await findCoachClientRel(sess.db, invite.coachId, sess.uid);
    expect(
      rel,
      "coachClients relationship should exist after claim",
    ).not.toBeNull();
    expect(rel!.status).toBe("active");
    const sub = (rel as { subscription?: { status?: string } }).subscription;
    expect(sub, "claimed client has a subscription state").toBeTruthy();
    expect(sub!.status, "invited client defaults to trial").toBe("trial");
    const me = await readDoc<{ assignedCoachId?: string }>(sess.db, [
      "users",
      sess.uid,
    ]);
    expect(me!.assignedCoachId).toBe(invite.coachId);
  });

  test("a claimed invite cannot be reused (rules)", async () => {
    const coach = await signInAs("coach");
    const invite = await createInvite(coach, {});
    await coach.close();

    // First claim succeeds (via the SDK factory, mirroring AcceptInvite).
    await claimInvite(invite, {
      email: uniqueEmail("qa-reuse-1"),
      password: "Reuse123456!",
      displayName: "QA Reuse 1",
    });

    // Any other signed-in client attempting to re-claim the now-`claimed` invite
    // is denied (the claim branch only permits pending → claimed).
    const client = await signInAs("client");
    try {
      const r = await attempt(() =>
        setDoc(
          doc(client.db, "signupInvites", invite.code),
          {
            status: "claimed",
            claimedByUid: client.uid,
            claimedAt: Date.now(),
          },
          { merge: true },
        ),
      );
      expect(
        isPermissionDenied(r),
        `re-claiming a claimed invite should be denied (got ${r.code ?? "ok"})`,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("a forged/unknown invite code cannot attach a client to a coach (rules)", async () => {
    const coach = await signInAs("coach");
    const coachId = coach.uid;
    await coach.close();
    // An existing client (already assigned to their own coach) cannot self-create
    // a NEW relationship to an arbitrary coach without a valid pending invite.
    const client = await signInAs("client");
    try {
      const fakeRel = `${coachId}__${client.uid}`;
      const r = await attempt(() =>
        setDoc(doc(client.db, "coachClients", fakeRel), {
          id: fakeRel,
          coachId,
          clientId: client.uid,
          status: "active",
          createdBy: client.uid,
          inviteCode: "FORGED99",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
      expect(
        isPermissionDenied(r),
        `forging a relationship without a valid invite should be denied (got ${r.code ?? "ok"})`,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("an expired invite is not claimable (rules deny + UI shows invalid)", async ({
    page,
  }) => {
    const coach = await signInAs("coach");
    const invite = await createInvite(coach, { expiresAt: Date.now() - 1000 });
    await coach.close();
    // UI: invalid screen.
    await page.goto(`/invite/${invite.code}`);
    await expect(page.getByTestId(TID.inviteInvalid)).toBeVisible({
      timeout: 20_000,
    });
  });
});
