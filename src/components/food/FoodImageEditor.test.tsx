import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FoodImageRef } from '@/types';

const media = vi.hoisted(() => {
  class UploadError extends Error {
    constructor(public code: string) {
      super(code);
      this.name = 'UploadError';
    }
  }
  return { UploadError, uploadFoodPhoto: vi.fn(), configured: { value: true } };
});
vi.mock('@/services/platform/mediaApi', () => ({
  useUploadConfigured: () => media.configured.value,
  uploadFoodPhoto: media.uploadFoodPhoto,
  UploadError: media.UploadError,
}));
const prep = vi.hoisted(() => {
  class FoodPhotoError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  return { FoodPhotoError, prepareFoodPhoto: vi.fn() };
});
vi.mock('@/lib/foodImageProcess', () => prep);

import { FoodImageEditor } from './FoodImageEditor';

/**
 * B4.1 — the coach's food photo control: add, replace (a NEW file, next revision), remove, use the
 * Forma photo, progress, a useful error, and Retry without picking the photo again.
 */
const photo = { full: new Blob(['f'], { type: 'image/webp' }), thumb: new Blob(['t'], { type: 'image/webp' }), width: 1200, height: 900 };
const forma: FoodImageRef = { source: 'forma-catalog', catalogFoodId: 'ff_ful', url: 'https://catalog.forma.test/ful-card.webp', thumbUrl: 'https://catalog.forma.test/ful-thumb.webp', author: 'Jane Doe', license: 'CC-BY-SA-4.0', rev: 1, uploadedAt: 1 };
const name = { en: 'Ful medames', ar: 'فول مدمس' };
const choose = () => fireEvent.change(screen.getByTestId('fi-file'), { target: { files: [new File(['x'], 'ful.jpg', { type: 'image/jpeg' })] } });

beforeEach(() => {
  media.uploadFoodPhoto.mockReset();
  prep.prepareFoodPhoto.mockReset().mockResolvedValue(photo);
  media.configured.value = true;
});

describe('FoodImageEditor', () => {
  it('uploads the prepared photo as the coach’s own picture, named after the food', async () => {
    media.uploadFoodPhoto.mockResolvedValue({ url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/b.webp' });
    const onChange = vi.fn();
    render(<FoodImageEditor value={null} onChange={onChange} name={name} testId="fi" />);
    expect(screen.getByTestId('fi-pick')).toHaveTextContent('Add photo');
    choose();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toMatchObject({ source: 'upload', url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/b.webp', width: 1200, height: 900, alt: name, rev: 1 });
  });

  it('a replacement is the next revision; remove sends null', async () => {
    const own: FoodImageRef = { source: 'upload', url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/b.webp', rev: 3, uploadedAt: 1 };
    media.uploadFoodPhoto.mockResolvedValue({ url: 'https://media.forma.test/Forma/c1/foods/c.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/d.webp' });
    const onChange = vi.fn();
    render(<FoodImageEditor value={own} onChange={onChange} name={name} testId="fi" />);
    expect(screen.getByTestId('fi-pick')).toHaveTextContent('Replace photo');
    choose();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://media.forma.test/Forma/c1/foods/c.webp', rev: 4 })));
    fireEvent.click(screen.getByTestId('fi-remove'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('offers the approved Forma photo, with its credit once chosen', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FoodImageEditor value={null} formaImage={forma} onChange={onChange} name={name} testId="fi" />);
    fireEvent.click(screen.getByTestId('fi-use-forma'));
    expect(onChange).toHaveBeenCalledWith(forma);
    rerender(<FoodImageEditor value={forma} formaImage={forma} onChange={onChange} name={name} testId="fi" />);
    expect(screen.queryByTestId('fi-use-forma')).toBeNull();
    expect(screen.getByTestId('fi-credit')).toHaveTextContent('Jane Doe');
  });

  it('a failed upload says so and Retry sends the same prepared photo again', async () => {
    media.uploadFoodPhoto.mockRejectedValueOnce(new media.UploadError('failed')).mockResolvedValueOnce({ url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/b.webp' });
    const onChange = vi.fn();
    render(<FoodImageEditor value={null} onChange={onChange} name={name} testId="fi" />);
    choose();
    expect(await screen.findByTestId('fi-error')).toHaveTextContent("didn't upload");
    fireEvent.click(screen.getByTestId('fi-retry'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(prep.prepareFoodPhoto).toHaveBeenCalledTimes(1);
    expect(media.uploadFoodPhoto.mock.calls[1][0]).toBe(photo);
    expect(screen.queryByTestId('fi-error')).toBeNull();
  });

  it('a refused photo explains why, and is not offered for Retry', async () => {
    media.uploadFoodPhoto.mockRejectedValueOnce(new media.UploadError('badDimensions'));
    render(<FoodImageEditor value={null} onChange={vi.fn()} name={name} testId="fi" />);
    choose();
    expect(await screen.findByTestId('fi-error')).toHaveTextContent('64–8192');
    expect(screen.queryByTestId('fi-retry')).toBeNull();
  });

  it('a file that is not a usable photo is stopped on the device', async () => {
    prep.prepareFoodPhoto.mockRejectedValueOnce(new prep.FoodPhotoError('tooSmall'));
    render(<FoodImageEditor value={null} onChange={vi.fn()} name={name} testId="fi" />);
    choose();
    expect(await screen.findByTestId('fi-error')).toHaveTextContent('too small');
    expect(media.uploadFoodPhoto).not.toHaveBeenCalled();
  });

  it('shows progress while uploading; cancel stops without an error', async () => {
    let signal: AbortSignal | undefined;
    media.uploadFoodPhoto.mockImplementation((_p: unknown, o: { signal: AbortSignal; onProgress: (n: number) => void }) => {
      signal = o.signal;
      o.onProgress(40);
      return new Promise((_r, reject) => o.signal.addEventListener('abort', () => reject(new media.UploadError('cancelled'))));
    });
    const onChange = vi.fn();
    render(<FoodImageEditor value={null} onChange={onChange} name={name} testId="fi" />);
    choose();
    expect(await screen.findByTestId('fi-progress')).toHaveAttribute('aria-valuenow', '40');
    fireEvent.click(screen.getByTestId('fi-cancel'));
    await waitFor(() => expect(screen.queryByTestId('fi-progress')).toBeNull());
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByTestId('fi-error')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('without upload storage the picker is disabled and says so', () => {
    media.configured.value = false;
    render(<FoodImageEditor value={null} onChange={vi.fn()} name={name} testId="fi" />);
    expect(screen.getByTestId('fi-pick')).toBeDisabled();
    expect(screen.getByTestId('fi')).toHaveTextContent("isn't available here yet");
  });
});

describe('FoodImageEditor — a picture link (B4.2)', () => {
  it('an https link is used as the picture; anything else cannot be used', () => {
    const onChange = vi.fn();
    render(<FoodImageEditor value={null} onChange={onChange} name={name} testId="fi" />);
    fireEvent.click(screen.getByTestId('fi-link'));
    fireEvent.change(screen.getByTestId('fi-link-input'), { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByTestId('fi-link-use')).toBeDisabled();
    fireEvent.change(screen.getByTestId('fi-link-input'), { target: { value: ' https://images.example.com/ful.jpg ' } });
    fireEvent.click(screen.getByTestId('fi-link-use'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'url', url: 'https://images.example.com/ful.jpg', thumbUrl: 'https://images.example.com/ful.jpg', rev: 1 }));
  });
});
