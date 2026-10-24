import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

/**
 * B4 (FD-03 / FD-11) — the Open Food Facts lookup (wger's ingredient feed is an ODbL extract of
 * OFF): the results carry the ODbL notice with links, and a pick keeps that source on the row it
 * creates, with values from the one shared serving calculation.
 */
vi.mock('@/services/platform/foodSearchApi', () => ({
  searchFoods: async () => [
    { id: 'wger-ing-1', name: 'Oat flakes', quantity: '100 g', calories: 372, protein: 13.5, carbs: 58.7, fats: 7, sourceId: '1', sourceProvider: 'wger', sourceNutrition: { baseGrams: 100, calories: 372, protein: 13.5, carbs: 58.7, fats: 7 } },
  ],
}));

import { FoodSearchPicker } from './FoodSearchPicker';

describe('food database lookup (Open Food Facts via wger)', () => {
  it('shows the ODbL notice with links, and a pick keeps its source and computed serving', async () => {
    const onPick = vi.fn();
    render(<FoodSearchPicker onPick={onPick} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search a food database…' }), { target: { value: 'oats' } });
    const credit = await screen.findByTestId('off-attribution', {}, { timeout: 3000 });
    expect(within(credit).getByRole('link', { name: 'Open Food Facts' })).toHaveAttribute('href', 'https://world.openfoodfacts.org');
    expect(within(credit).getByRole('link', { name: 'ODbL' })).toHaveAttribute('href', 'https://opendatacommons.org/licenses/odbl/1-0/');

    fireEvent.click(screen.getByTestId('food-search-result'));
    fireEvent.change(screen.getByTestId('food-search-grams'), { target: { value: '45' } });
    fireEvent.click(screen.getByTestId('food-search-use'));
    expect(onPick).toHaveBeenCalledWith({
      name: 'Oat flakes',
      quantity: '45 g',
      calories: 167, // 372 × 0.45 = 167.4
      protein: 6.1,
      carbs: 26.4,
      fats: 3.2, // 3.15 → half away from zero
      provenance: {
        per100g: { kcal: 372, protein: 13.5, carbs: 58.7, fat: 7 },
        portion: { id: 'g', amount: 45, grams: 45 },
        source: { provider: 'open-food-facts', license: 'ODbL-1.0', attribution: 'Contains data from Open Food Facts (via wger.de), available under the ODbL', url: 'https://wger.de/en/nutrition/ingredient/1/view/' },
      },
    });
  });
});
