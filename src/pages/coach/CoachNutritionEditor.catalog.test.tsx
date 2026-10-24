import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { FoodItem, MealPlan } from '@/types';

/**
 * B4 — the nutrition editor with the Forma food catalog on: a pick's numbers are computed from the
 * USDA per-100 g values and a food-specific portion, saved WITH their provenance; changing the
 * serving recomputes; typing a value by hand drops every catalog claim (and says so).
 */
vi.mock('localforage', () => {
  const stores = new Map<string, Map<string, unknown>>();
  const make = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return { getItem: async (k: string) => (m.has(k) ? m.get(k) : null), setItem: async (k: string, v: unknown) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k), keys: async () => [...m.keys()], clear: async () => m.clear() };
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

const label = (en: string, ar = en) => ({ en, ar });
const rice = {
  id: 'ff_rice_white_long_cooked',
  rev: 2,
  name: label('White rice (long grain), cooked', 'أرز أبيض طويل الحبة، مطبوخ'),
  category: 'grains',
  state: 'cooked',
  per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4 },
  portions: [{ id: 'cup', label: label('1 cup', 'كوب'), grams: 158 }],
  verification: 'source-values',
  matchNote: null,
  recipeNote: null,
};
const searchCatalogFoods = vi.fn(async (_input: unknown) => ({ total: 1, items: [rice], version: 'v' }));
vi.mock('@/services/platform/catalogApi', () => ({
  catalogMetaQuery: () => ({
    queryKey: ['catalog', 'meta'],
    queryFn: async () => ({ enabled: true, taxonomy: { foodCategories: { grains: label('Grains') }, foodStates: { cooked: label('Cooked', 'مطبوخ') }, muscles: {}, equipment: {}, patterns: {}, bodyParts: {}, difficulty: {} }, licenses: {} }),
  }),
  searchCatalogFoods: (input: unknown) => searchCatalogFoods(input as never),
}));

import { CoachNutritionEditor } from './CoachNutritionEditor';

const plan = { id: 'mp1', name: 'Cut', meals: [{ id: 'm1', slot: 'lunch', label: label('Lunch', 'غداء'), items: [] }], targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 }, supplements: [], waterTargetMl: 0, beverageNotes: [], generalNotes: [], updatedAt: 1000 } as unknown as MealPlan;

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
async function savePlan(): Promise<FoodItem> {
  saveClientMealPlan.mockResolvedValueOnce({ ...plan, updatedAt: 2000 });
  fireEvent.click(screen.getByTestId('nutrition-save'));
  await waitFor(() => expect(saveClientMealPlan).toHaveBeenCalled());
  const sent = saveClientMealPlan.mock.calls.at(-1)![1] as MealPlan;
  return sent.meals[0].items[0];
}

beforeEach(async () => {
  getClientMealPlan.mockReset();
  saveClientMealPlan.mockReset();
  getClientMealPlan.mockResolvedValue(plan);
  await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
});

describe('nutrition editor × Forma foods (B4)', () => {
  async function pickRice(cups: string) {
    renderEditor();
    fireEvent.click(await screen.findByTestId('nutrition-add-food'));
    fireEvent.change(await screen.findByTestId('food-catalog-search'), { target: { value: 'rice' } });
    fireEvent.click(await screen.findByTestId('catalog-food-row'));
    const amount = await screen.findByTestId('food-catalog-amount');
    fireEvent.change(amount, { target: { value: cups } });
    fireEvent.blur(amount);
    fireEvent.click(screen.getByTestId('food-catalog-use'));
  }

  it('a serving is computed from per-100 g × a food-specific portion and saved with its provenance', async () => {
    await pickRice('2');
    expect(screen.getByTestId('food-calories')).toHaveValue('411');
    fireEvent.click(screen.getByTestId('food-save'));
    const item = await savePlan();
    expect(item).toMatchObject({
      name: { en: 'White rice (long grain), cooked', ar: 'أرز أبيض طويل الحبة، مطبوخ' },
      calories: 411,
      protein: 8.5,
      carbs: 89,
      fats: 0.9,
      catalogId: 'ff_rice_white_long_cooked',
      catalogRev: 2,
      per100g: rice.per100g,
      portion: { id: 'cup', amount: 2, grams: 316 },
      foodState: 'cooked',
      verification: 'source-values',
      source: { provider: 'forma-catalog', license: 'CC0-1.0' },
    });
    expect(item.quantity).toBe('2 × 1 cup (316 g)');
  });

  it('a recipe estimate says what it assumes and that it is a Forma recipe, not one USDA record', async () => {
    const koshary = { ...rice, id: 'ff_koshary', name: label('Koshary (estimate)', 'كشري (تقدير)'), category: 'dishes', state: 'prepared', verification: 'recipe-estimate', portions: [{ id: 'plate', label: label('1 medium plate', 'طبق متوسط'), grams: 450 }], recipeNote: label('A medium plate with 2 tsp oil.', 'طبق متوسط بملعقتين صغيرتين زيت.') };
    searchCatalogFoods.mockResolvedValueOnce({ total: 1, items: [koshary], version: 'v' } as never);
    renderEditor();
    fireEvent.click(await screen.findByTestId('nutrition-add-food'));
    fireEvent.change(await screen.findByTestId('food-catalog-search'), { target: { value: 'koshary' } });
    fireEvent.click(await screen.findByTestId('catalog-food-row'));
    expect(await screen.findByTestId('food-catalog-note')).toHaveTextContent('A medium plate with 2 tsp oil.');
    expect(screen.getByTestId('food-catalog-source')).toHaveTextContent('Forma recipe estimate');
  });

  it('typing a value by hand drops every catalog claim — and the sheet says so', async () => {
    await pickRice('1');
    expect(screen.getByTestId('food-serving')).toBeInTheDocument();
    const kcal = screen.getByTestId('food-calories');
    fireEvent.change(kcal, { target: { value: '250' } });
    fireEvent.blur(kcal);
    expect(await screen.findByTestId('food-by-hand')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('food-save'));
    const item = await savePlan();
    expect(item.calories).toBe(250);
    for (const k of ['catalogId', 'per100g', 'portion', 'verification', 'source']) expect(item).not.toHaveProperty(k);
  });
});

