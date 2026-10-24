import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FoodCardImage, FoodThumb } from './FoodImage';

/** B4.1 — a food's picture: fixed box, lazy, alt text, and a quiet placeholder when missing or broken. */
const image = { thumbUrl: 'https://catalog.forma.test/rice-thumb.webp', url: 'https://catalog.forma.test/rice-card.webp', alt: { en: 'Cooked rice', ar: 'أرز مطبوخ' } };

describe('FoodThumb', () => {
  it('shows the thumbnail lazily with its alt text', () => {
    render(<FoodThumb image={image} />);
    const img = screen.getByRole('img', { name: 'Cooked rice' });
    expect(img).toHaveAttribute('src', image.thumbUrl);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
  });

  it('falls back to the placeholder when there is no picture or it fails to load — never another picture', () => {
    const { rerender } = render(<FoodThumb image={null} />);
    expect(screen.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'false');
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<FoodThumb image={image} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'false');
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('FoodCardImage', () => {
  it('shows the card picture with its credit, and nothing at all when it breaks', () => {
    render(<FoodCardImage image={image} credit="Photo: Jane Doe · CC-BY-SA-4.0" />);
    expect(screen.getByRole('img', { name: 'Cooked rice' })).toHaveAttribute('src', image.url);
    expect(screen.getByTestId('food-card-image')).toHaveTextContent('Jane Doe');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByTestId('food-card-image')).toBeNull();
  });
});
