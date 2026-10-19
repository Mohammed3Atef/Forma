import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MealPlan } from '@/types';

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
vi.mock('@/services/platform/coachAssetsApi', () => ({ listFoodGroups: async () => [], listFoods: async () => [], listSupplements: async () => [] }));
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

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/coach/client/c1/nutrition']}>
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
