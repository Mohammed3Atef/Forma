import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MealPlan } from '@/types';
import en from '@/i18n/en.json';
import ar from '@/i18n/ar.json';
import arEg from '@/i18n/ar-eg.json';

vi.mock('localforage', () => {
  const stores = new Map<string, Map<string, unknown>>();
  const make = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      getItem: async (k: string) => (m.has(k) ? m.get(k) : null),
      setItem: async (k: string, v: unknown) => void m.set(k, v),
      removeItem: async (k: string) => void m.delete(k),
      keys: async () => [...m.keys()],
      clear: async () => m.clear(),
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(`${o.name}/${o.storeName}`) } };
});
const getClientMealPlan = vi.fn();
const saveClientMealPlan = vi.fn();
vi.mock('@/services/platform/planApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/planApi')>()),
  getClientMealPlan: (id: string) => getClientMealPlan(id),
  saveClientMealPlan: (id: string, p: MealPlan, o: unknown) => saveClientMealPlan(id, p, o),
}));
const libFoods = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/platform/coachAssetsApi', () => ({ listFoodGroups: async () => [], listFoods: async () => libFoods.list, listSupplements: async () => [] }));
vi.mock('@/components/coach/ClientContextPanel', () => ({ ClientContextPanel: () => null }));
vi.mock('@/stores/dialogStore', () => ({ confirmDelete: async () => true, confirmDialog: async () => true }));

import { CoachNutritionEditor } from './CoachNutritionEditor';

// A plan with everything the client app reads — including fields this editor never touches.
const plan = {
  id: 'mp1',
  name: 'Cut',
  meals: [
    {
      id: 'm1',
      slot: 'breakfast',
      label: { en: 'Breakfast', ar: 'فطور' },
      items: [
        { id: 'f1', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6, allowedAlternativeGroupId: 'gone', allowedAlternatives: [{ id: 'x', name: { en: 'Rice', ar: '' }, quantity: '100 g', calories: 130, protein: 3, carbs: 28, fats: 0 }] },
        { id: 'f2', name: { en: 'Eggs', ar: '' }, quantity: '2', calories: 140, protein: 12, carbs: 1, fats: 10, allowCustomSubstitution: true },
      ],
    },
  ],
  targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 },
  supplements: [{ id: 's1', name: 'Creatine', dose: { en: '5 g', ar: '' } }],
  waterTargetMl: 3000,
  beverageNotes: [{ en: 'Black coffee is fine', ar: 'القهوة السادة مسموحة' }],
  generalNotes: [],
  substitutionPolicy: { allowClientSubstitutions: true, allowCustomFoods: false, requireCoachApproval: false },
  meta: { assignedAt: 1, assignedBy: 'c', isCustomized: false },
  updatedAt: 1000,
} as MealPlan;

function renderEditor(path = '/coach/client/c1/nutrition') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coach/client/:clientId/nutrition" element={<CoachNutritionEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const sent = () => saveClientMealPlan.mock.calls[0][1] as MealPlan;
async function saveNow() {
  saveClientMealPlan.mockResolvedValueOnce({ ...plan, updatedAt: 2000 });
  fireEvent.click(screen.getByTestId('nutrition-save'));
  await waitFor(() => expect(saveClientMealPlan).toHaveBeenCalledTimes(1));
}

beforeEach(async () => {
  getClientMealPlan.mockReset();
  saveClientMealPlan.mockReset();
  getClientMealPlan.mockResolvedValue(plan);
  await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
});

describe('nutrition editor (B3.5)', () => {
  it('opens clean: targets first, planned vs target as four rows, the first meal open', async () => {
    renderEditor();
    expect(await screen.findByTestId('nutrition-clean')).toBeInTheDocument();
    expect(screen.getByTestId('nutrition-target-calories')).toHaveValue('2000');
    expect(within(screen.getByTestId('nutrition-totals')).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByTestId('nutrition-total-calories')).toHaveTextContent('440 / 2000');
    expect(screen.getByText('Oats')).toBeInTheDocument();
  });

  it('opening a food and applying it unchanged changes nothing (alternatives snapshot and custom flag kept)', async () => {
    renderEditor();
    fireEvent.click(await screen.findByText('Oats'));
    fireEvent.click(await screen.findByTestId('food-save'));
    expect(screen.getByTestId('nutrition-clean')).toBeInTheDocument();
  });

  it('bilingual meal label, supplement dose and client notes; reorder; every other field saved as it was', async () => {
    renderEditor();
    await screen.findByTestId('nutrition-clean');
    // Arabic meal label (the second-language field opens on demand).
    const labelAr = screen.getByTestId('meal-label-ar');
    fireEvent.click(within(labelAr).getByRole('button'));
    fireEvent.change(within(labelAr).getByTestId('meal-label-ar-input'), { target: { value: 'إفطار' } });
    // Move Eggs above Oats.
    fireEvent.click(screen.getByRole('button', { name: 'Move Eggs up' }));
    // A general note in both languages.
    fireEvent.click(screen.getByTestId('generalNotes-add'));
    // Typed character by character keeps its spaces (trimmed only when saved).
    for (const v of ['Eat', 'Eat ', 'Eat s', 'Eat slowly ']) fireEvent.change(screen.getByTestId('generalNotes-en'), { target: { value: v } });
    expect(screen.getByTestId('generalNotes-en')).toHaveValue('Eat slowly ');
    // Supplement dose in Arabic.
    fireEvent.click(screen.getByText('Creatine'));
    const doseAr = await screen.findByTestId('supp-dose-ar');
    fireEvent.click(within(doseAr).getByRole('button'));
    fireEvent.change(within(doseAr).getByTestId('supp-dose-ar-input'), { target: { value: '5 جم' } });
    fireEvent.click(screen.getByTestId('supp-save'));
    expect(screen.getByTestId('nutrition-unsaved')).toBeInTheDocument();
    await saveNow();
    const p = sent();
    expect(p.meals[0].label).toEqual({ en: 'Breakfast', ar: 'إفطار' });
    expect(p.meals[0].items.map((i) => i.id)).toEqual(['f2', 'f1']);
    expect(p.meals[0].items[1]).toEqual(plan.meals[0].items[0]); // the snapshot of a deleted group is kept
    expect(p.meals[0].items[0]).toEqual(plan.meals[0].items[1]);
    // B1.8 rule: an empty other language follows the edited one (until a real translation is written).
    expect(p.generalNotes).toEqual([{ en: 'Eat slowly', ar: 'Eat slowly' }]);
    expect(p.beverageNotes).toEqual(plan.beverageNotes);
    expect(p.supplements).toEqual([{ id: 's1', name: 'Creatine', dose: { en: '5 g', ar: '5 جم' } }]);
    expect(p.substitutionPolicy).toEqual(plan.substitutionPolicy);
    expect(p.meta).toEqual(plan.meta);
    expect(p.waterTargetMl).toBe(3000);
  });

  it('blank note rows are not saved; deleting a supplement asks first and removes only it', async () => {
    renderEditor();
    await screen.findByTestId('nutrition-clean');
    fireEvent.click(screen.getByTestId('generalNotes-add'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Creatine' }));
    await waitFor(() => expect(screen.queryByText('Creatine')).toBeNull());
    await saveNow();
    expect(sent().generalNotes).toEqual([]);
    expect(sent().supplements).toEqual([]);
  });
});

describe('B3.7 — a food from the Library ("Use in a client plan")', () => {
  beforeEach(async () => {
    await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
    getClientMealPlan.mockReset();
    saveClientMealPlan.mockReset();
    const { useSession } = await import('@/services/auth/sessionStore');
    useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', displayName: 'C', email: 'c@x.test' } as never });
    libFoods.list = [{ id: 'lib-yog', name: { en: 'Greek yogurt', ar: 'زبادي يوناني' }, quantity: '170 g', calories: 100, protein: 17, carbs: 6, fats: 0, category: 'Dairy', tags: ['snack'] }];
  });

  it('asks for the meal, adds the food in both languages as an unsaved change, and Save sends it with everything else unchanged', async () => {
    getClientMealPlan.mockResolvedValue(plan);
    renderEditor('/coach/client/c1/nutrition?addFood=lib-yog');
    const prompt = await screen.findByTestId('library-add');
    expect(screen.getByText('Add “Greek yogurt”')).toBeInTheDocument();
    const targets = within(prompt).getAllByTestId('library-add-target');
    expect(targets).toHaveLength(1);
    expect(targets[0]).toHaveTextContent('Breakfast');
    fireEvent.click(targets[0]);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByTestId('nutrition-unsaved')).toBeInTheDocument();
    expect(saveClientMealPlan).not.toHaveBeenCalled();
    await saveNow();
    const items = sent().meals[0].items;
    expect(items.slice(0, 2)).toEqual(plan.meals[0].items); // the foods already there are untouched
    expect(items[2]).toEqual({ id: expect.any(String), name: { en: 'Greek yogurt', ar: 'زبادي يوناني' }, quantity: '170 g', calories: 100, protein: 17, carbs: 6, fats: 0 });
    expect(sent().targets).toEqual(plan.targets);
  });

  it('a new meal; a food that is gone adds nothing and says so', async () => {
    getClientMealPlan.mockResolvedValue(plan);
    const a = renderEditor('/coach/client/c1/nutrition?addFood=lib-yog');
    fireEvent.click(await screen.findByTestId('library-add-new'));
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByTestId('nutrition-unsaved')).toBeInTheDocument();
    a.unmount();
    await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
    renderEditor('/coach/client/c1/nutrition?addFood=lib-gone');
    expect(await screen.findByTestId('library-add-missing')).toHaveTextContent('no longer in your library');
    expect(screen.getByTestId('nutrition-clean')).toBeInTheDocument();
  });
});

describe('B37-R2 — a new meal is named in both languages, whatever language the app is in', () => {
  beforeEach(async () => {
    await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
    getClientMealPlan.mockReset();
    saveClientMealPlan.mockReset();
    getClientMealPlan.mockResolvedValue(plan);
    const { useSession } = await import('@/services/auth/sessionStore');
    useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', displayName: 'C', email: 'c@x.test' } as never });
    libFoods.list = [{ id: 'lib-yog', name: { en: 'Greek yogurt', ar: 'زبادي يوناني' }, quantity: '170 g', calories: 100, protein: 17, carbs: 6, fats: 0 }];
  });
  afterEach(async () => {
    await (await import('@/i18n')).applyLocale('en');
  });

  const ADD_MEAL = { en: en.coachEditor.addMeal, ar: ar.coachEditor.addMeal, 'ar-eg': arEg.coachEditor.addMeal };
  const NEW_MEAL = { en: en.library.add.newMeal, ar: ar.library.add.newMeal, 'ar-eg': arEg.library.add.newMeal };
  for (const locale of ['en', 'ar', 'ar-eg'] as const) {
    it(`${locale}: "Add meal" stores "Meal 2" / "وجبة 2"; the existing meal is untouched`, async () => {
      await (await import('@/i18n')).applyLocale(locale);
      renderEditor();
      await screen.findByTestId('nutrition-clean');
      expect(screen.getByTestId('nutrition-add-meal')).toHaveTextContent(ADD_MEAL[locale]); // the app really is in this language
      fireEvent.click(screen.getByTestId('nutrition-add-meal'));
      await saveNow();
      expect(sent().meals).toHaveLength(2);
      expect(sent().meals[0]).toEqual(plan.meals[0]);
      expect(sent().meals[1]).toMatchObject({ label: { en: 'Meal 2', ar: 'وجبة 2' }, items: [] });
    });

    it(`${locale}: "New meal" from the Library stores "Meal 2" / "وجبة 2" with the food in both languages`, async () => {
      await (await import('@/i18n')).applyLocale(locale);
      renderEditor('/coach/client/c1/nutrition?addFood=lib-yog');
      expect(await screen.findByTestId('library-add-new')).toHaveTextContent(NEW_MEAL[locale]);
      fireEvent.click(screen.getByTestId('library-add-new'));
      await screen.findByTestId('nutrition-unsaved');
      await saveNow();
      expect(sent().meals[0]).toEqual(plan.meals[0]);
      expect(sent().meals[1].label).toEqual({ en: 'Meal 2', ar: 'وجبة 2' });
      expect(sent().meals[1].items.map((f) => f.name)).toEqual([{ en: 'Greek yogurt', ar: 'زبادي يوناني' }]);
    });
  }

  it('a name the coach types replaces the generated one in both languages; a meal with its own Arabic keeps it', async () => {
    renderEditor();
    await screen.findByTestId('nutrition-clean');
    fireEvent.click(screen.getByTestId('nutrition-add-meal'));
    const fields = await screen.findAllByTestId('meal-label');
    expect(fields.at(-1)).toHaveValue('Meal 2');
    for (const v of ['S', 'Sn', 'Snack']) fireEvent.change(screen.getAllByTestId('meal-label').at(-1)!, { target: { value: v } });
    // The first meal: a new English name keeps its real Arabic name.
    fireEvent.click(screen.getAllByTestId('nutrition-meal-toggle')[0]);
    fireEvent.change(await within(screen.getAllByTestId('nutrition-meal')[0]).findByTestId('meal-label'), { target: { value: 'Late breakfast' } });
    await saveNow();
    expect(sent().meals.map((m) => m.label)).toEqual([
      { en: 'Late breakfast', ar: 'فطور' },
      { en: 'Snack', ar: 'Snack' },
    ]);
  });
});
