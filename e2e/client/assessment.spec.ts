import { test, expect } from "@playwright/test";
import { CLIENT_AUTH } from "./helpers";

test.use({ storageState: CLIENT_AUTH });

/**
 * client@forma.test almost certainly already has a completed assessment (it has
 * 10 weeks of seeded history and an assigned coach). We check the actual current
 * state rather than assuming, and only run the wizard if it's genuinely not
 * completed  — re-submitting a reviewed assessment could disrupt other agents'
 * concurrent work on this same account.
 */
test("assessment renders correctly, or is completed through the real wizard if missing", async ({
  page,
}) => {
  await page.goto("/assessment");

  const notCompleted = page.getByText(/not completed/i);
  const isNotCompleted = await notCompleted.isVisible().catch(() => false);

  if (!isNotCompleted) {
    // Already has an assessment on file — verify it renders, don't touch it.
    await expect(page.getByText(/last updated/i)).toBeVisible();
    await expect(page.getByTestId("coach-info")).toBeVisible();
    await expect(page.getByTestId("assessment-edit")).toBeVisible();
    console.log(
      "[assessment.spec] assessment already completed — verified read-only render, did not resubmit.",
    );
    return;
  }

  // Genuinely not started — fill the real multi-step wizard end to end.
  await expect(page.getByTestId("assessment-wizard")).toBeVisible();

  // Step 0 — basic
  await page.getByTestId("a-fullname").fill("Client Forma QA");
  await page.getByTestId("a-dob").fill("1996-05-14");
  await page.getByTestId("opt-male").click();
  await page.getByTestId("a-height").fill("178");
  await page.getByTestId("a-weight").fill("89");
  await page.getByTestId("assessment-next").click();

  // Step 1 — goals
  await page.getByTestId("opt-fat_loss").first().click();
  await page.getByTestId("assessment-next").click();

  // Step 2 — lifestyle (chip defaults are fine; just advance)
  await page.getByTestId("assessment-next").click();

  // Step 3 — training
  await page.getByTestId("assessment-next").click();

  // Step 4 — health (must answer injuries + medical to advance)
  await page.getByTestId("a-no-injuries").click();
  await page.getByTestId("assessment-next").click();

  // Step 5 — nutrition
  await page.getByTestId("assessment-next").click();

  // Step 6 — motivation
  await page.getByTestId("assessment-next").click();

  // Step 7 — photos (optional) — submit without uploading here; dedicated
  // progress-photos coverage happens on the Progress Photos page instead.
  await page.getByTestId("assessment-submit").click();

  await expect(page.getByTestId("assessment-done")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("assessment-go-dashboard").click();
  await expect(page.getByTestId("client-home")).toBeVisible({
    timeout: 15_000,
  });
});
