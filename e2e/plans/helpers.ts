import { expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH = (role: string) => path.join(__dirname, '..', '.auth', `${role}.json`);

/**
 * Logs in fresh, right now, instead of trusting a saved e2e/.auth/*.json
 * snapshot. Several other agents share these same demo accounts concurrently
 * during this QA pass, and a saved session can get invalidated between when
 * it was captured and when a later spec step actually uses it (observed
 * directly while writing this suite — a client.json only ~60s old had already
 * been bounced back to /login by the time the client-verification step ran).
 * Logging in immediately before the read we care about shrinks that race to a
 * few seconds instead of minutes.
 */
export async function loginFresh(page: Page, emailVar: string, passVar: string) {
  const email = process.env[emailVar];
  const password = process.env[passVar];
  if (!email || !password) throw new Error(`Missing ${emailVar}/${passVar} in .env`);
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.locator('body')).not.toContainText('Welcome back', { timeout: 20_000 });
}

/**
 * Fixed ids for the permanent demo dataset built this session (see
 * scripts/seed-demo-dataset.mjs). Looked up once via Mongo (`users.emailLower`)
 * — these are stable, permanent accounts, same pattern as COACH_A_ID in
 * e2e/transfers/assign-and-transfer.spec.ts.
 */
export const IDS = {
  coachA: 'b4c03c48-cfc3-4f07-92ef-75149b6c32f9', // coach@forma.test
  clientMain: '6259f5db-910e-4fc0-a71d-829736484ca7', // client@forma.test
  ahmedKamal: '0527ef38-004b-487a-aed1-4bd0a9735d05', // demo.client05@forma.test — Ahmed Kamal
  mariamAdel: '9bc4a0eb-625e-48fd-ac00-47c0ae937e71', // demo.client06@forma.test — Mariam Adel
};

export const PRESET_LABEL: Record<string, string> = {
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  pump: 'Pump',
  mobility: 'Mobility',
  finisher: 'Finisher',
};

export const SECTION_KIND_LABEL: Record<string, string> = {
  normal: 'Workout',
  warmup: 'Warm-up',
  working: 'Working',
  mobility: 'Mobility',
  finisher: 'Finisher',
};

export interface ExerciseSpec {
  name: string;
  target: string;
  preset?: keyof typeof PRESET_LABEL;
  notes?: string;
}

/** Adds one exercise via the picker's "Quick create" flow (builder must be at section level). */
export async function addExercise(page: Page, spec: ExerciseSpec) {
  await page.getByTestId('builder-add-exercise').click();
  const picker = page.getByTestId('exercise-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('picker-quick-create').click();
  const form = page.getByTestId('exercise-form');
  await expect(form).toBeVisible();
  await form.getByTestId('ex-name').fill(spec.name);
  await form.getByTestId('ex-target').fill(spec.target);
  if (spec.preset) await form.getByRole('button', { name: PRESET_LABEL[spec.preset], exact: true }).click();
  if (spec.notes) await form.getByTestId('ex-notes').fill(spec.notes);
  await form.getByTestId('ex-save').click();
  await expect(form).not.toBeVisible();
}

export interface SectionSpec {
  title: string;
  kind: keyof typeof SECTION_KIND_LABEL;
  exercises: ExerciseSpec[];
}

export interface DaySpec {
  title: string;
  focus: string;
  sections: SectionSpec[];
}

/**
 * Clears every existing day from the plan-level view (used at the start of a
 * build so a re-run of a spec — e.g. after a mid-test failure on a previous
 * attempt — starts from a clean plan instead of piling duplicate days onto
 * whatever a prior partial run already saved).
 */
export async function removeAllDays(page: Page) {
  await expect(page.getByTestId('builder-plan')).toBeVisible();
  while (await page.getByTestId('builder-day-card').count()) {
    await page.getByTestId('builder-day-card').first().click();
    await expect(page.getByTestId('builder-day')).toBeVisible();
    await page.getByRole('button', { name: 'Remove day', exact: true }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('builder-plan')).toBeVisible();
  }
}

/**
 * Builds one full workout day (sections + exercises) starting and ending at the
 * plan-level view of the PlanBuilder (the workout editor's main screen).
 */
export async function buildDay(page: Page, spec: DaySpec) {
  await page.getByTestId('builder-add-day').click();
  await expect(page.getByTestId('builder-day')).toBeVisible();
  await page.getByTestId('day-title').fill(spec.title);
  await page.getByTestId('day-focus').fill(spec.focus);

  for (const section of spec.sections) {
    await page.getByTestId('builder-add-section').click();
    await expect(page.getByTestId('builder-section')).toBeVisible();
    await page.getByTestId('section-title').fill(section.title);
    await page.getByTestId('builder-section').getByRole('button', { name: SECTION_KIND_LABEL[section.kind], exact: true }).click();
    for (const ex of section.exercises) await addExercise(page, ex);
    // back to day level
    await page.getByRole('button', { name: spec.title, exact: true }).click();
    await expect(page.getByTestId('builder-day')).toBeVisible();
  }

  // back to plan level
  await page.getByRole('button', { name: 'Workout plan', exact: true }).click();
  await expect(page.getByTestId('builder-plan')).toBeVisible();
}

/** "Save as new version" toolbar action, present in every plan editor's header. */
export async function saveAsNewVersion(page: Page, reason: string) {
  await page.getByTestId('version-save-new').click();
  await page.getByTestId('version-reason').fill(reason);
  await page.getByTestId('version-save-confirm').click();
}

/** Adds a meal (nutrition editor) and returns a Locator scoped to that meal's card. */
export async function addMeal(page: Page, opts: { label: string; slot: string }): Promise<Locator> {
  await page.getByTestId('nutrition-add-meal').click();
  const mealName = page.getByLabel('Meal name').last();
  await mealName.fill(opts.label);
  const mealCard = mealName.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " card ")][1]');
  await mealCard.getByRole('button', { name: opts.slot, exact: true }).click();
  return mealCard;
}

export interface FoodSpec {
  name: string;
  quantity: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  altGroup?: string;
}

/** Adds a food item to a meal card (nutrition editor). */
export async function addFoodToMeal(page: Page, mealCard: Locator, spec: FoodSpec) {
  await mealCard.getByTestId('nutrition-add-food').click();
  const form = page.getByTestId('food-form');
  await expect(form).toBeVisible();
  await form.getByTestId('food-name').fill(spec.name);
  await form.getByTestId('food-quantity').fill(spec.quantity);
  await form.getByTestId('food-calories').fill(spec.calories);
  await form.getByTestId('food-protein').fill(spec.protein);
  await form.getByTestId('food-carbs').fill(spec.carbs);
  await form.getByTestId('food-fats').fill(spec.fats);
  if (spec.altGroup) {
    // .first(): the coach's food-groups library isn't guaranteed name-unique.
    await form.getByTestId('meal-allowed-group').getByRole('button', { name: spec.altGroup, exact: true }).first().click();
  }
  await form.getByTestId('food-save').click();
  await expect(form).not.toBeVisible();
}

export interface CardioSessionSpec {
  type: string;
  duration: string;
  frequency: string;
  notes: string;
}

/** Adds a session to the cardio editor. */
export async function addCardioSession(page: Page, spec: CardioSessionSpec) {
  await page.getByTestId('cardio-add-session').click();
  const form = page.getByTestId('cardio-session-form');
  await expect(form).toBeVisible();
  await form.getByTestId(`cardio-type-${spec.type}`).click();
  await form.getByTestId('sess-duration').fill(spec.duration);
  await form.getByTestId('sess-frequency').fill(spec.frequency);
  await form.getByTestId('sess-notes').fill(spec.notes);
  await form.getByTestId('sess-save').click();
  await expect(form).not.toBeVisible();
}
