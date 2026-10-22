import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Subscription } from '@/types';

/**
 * B3.8 (Fix C + fixed-day terms): the package sheet says what it does — first package, renewal,
 * or an edit of the current one — and never sends a no-op.
 */
const h = vi.hoisted(() => ({
  first: vi.fn(async (..._a: unknown[]) => undefined),
  renew: vi.fn(async (..._a: unknown[]) => undefined),
  correct: vi.fn(async (..._a: unknown[]) => undefined),
  confirm: vi.fn(async (..._a: unknown[]) => true),
}));
vi.mock('@/services/platform/coachClientsApi', () => ({ startFirstTerm: h.first, renewSubscription: h.renew, correctSubscription: h.correct }));
vi.mock('@/services/platform/coachPlansApi', () => ({ listCoachPlans: async () => [] }));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: h.confirm, alertDialog: async () => undefined }));
vi.mock('@/stores/toastStore', () => ({ showToast: () => undefined }));

import { SubscriptionTermSheet, type TermSheetMode } from './SubscriptionTermSheet';

const local = (y: number, m: number, d: number, hr = 0) => new Date(y, m - 1, d, hr).getTime();
const NOW = local(2026, 10, 15, 12);
const running: Subscription = { status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', days: 30, months: 1, zone: Intl.DateTimeFormat().resolvedOptions().timeZone, startAt: local(2026, 10, 1), endAt: local(2026, 10, 31), price: 900, currency: 'EGP', planName: 'Monthly', termId: 'term-1', updatedAt: 1 };

function open(mode: TermSheetMode, sub: Subscription | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SubscriptionTermSheet coachId="coach-1" clientId="aya" sub={sub} mode={mode} open onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  h.first.mockClear();
  h.renew.mockClear();
  h.correct.mockClear();
  h.confirm.mockClear();
});

describe('first package', () => {
  it('picks a start day; 1 month = 30 days; the preview shows the first and LAST covered day', async () => {
    open('new', undefined);
    fireEvent.change(screen.getByTestId('term-start'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByTestId('term-price'), { target: { value: '900' } });
    expect(screen.getByTestId('term-end-preview')).toHaveTextContent('Covers 1 Oct 2026 – 30 Oct 2026 · 30 days');
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.first).toHaveBeenCalledTimes(1));
    expect(h.first.mock.calls[0]).toEqual(['coach-1', 'aya', { months: 1, price: 900, startDate: '2026-10-01' }, expect.stringMatching(/^term_/)]);
  });

  it('a price with three decimals cannot be saved', () => {
    open('new', undefined);
    fireEvent.change(screen.getByTestId('term-price'), { target: { value: '10.005' } });
    expect(screen.getByTestId('term-save')).toBeDisabled();
  });
});

describe('renewal', () => {
  it('a running package: the next one starts the day after it ends — shown, not editable — at the same price', async () => {
    open('renew', running);
    expect(screen.getByTestId('term-renew-start')).toHaveTextContent('31 Oct 2026');
    expect(screen.queryByTestId('term-start')).toBeNull();
    expect(screen.getByTestId('term-price')).toHaveValue('900');
    expect(screen.getByTestId('term-end-preview')).toHaveTextContent('Covers 31 Oct 2026 – 29 Nov 2026 · 30 days');
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.renew).toHaveBeenCalledTimes(1));
    expect(h.renew.mock.calls[0].slice(0, 3)).toEqual(['coach-1', 'aya', { months: 1, price: 900, planName: 'Monthly' }]);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it('a lapsed package renews from today by default; a start in the past is confirmed first', async () => {
    const lapsed = { ...running, startDate: '2026-09-01', endDate: '2026-10-01', startAt: local(2026, 9, 1), endAt: local(2026, 10, 1) };
    open('renew', lapsed);
    expect(screen.getByTestId('term-start')).toHaveValue('2026-10-15');
    fireEvent.change(screen.getByTestId('term-start'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.renew).toHaveBeenCalledTimes(1));
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.renew.mock.calls[0][2]).toMatchObject({ startDate: '2026-10-05' });
  });
});

describe('edit the current package (correction)', () => {
  it('nothing changed → nothing to save', () => {
    open('correct', running);
    expect(screen.getByTestId('term-save')).toBeDisabled();
    expect(screen.getByTestId('term-no-changes')).toBeVisible();
  });

  it('sends only what changed, with the term it was looking at', async () => {
    open('correct', running);
    fireEvent.change(screen.getByTestId('term-price'), { target: { value: '1000' } });
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.correct).toHaveBeenCalledTimes(1));
    expect(h.correct.mock.calls[0]).toEqual(['coach-1', 'aya', { reason: 'correction', price: 1000 }, { requestId: expect.stringMatching(/^term_/), expectedTermId: 'term-1' }]);
  });

  it('a package change is said to be one (same package, payments stay with it)', async () => {
    open('correct', running);
    expect(screen.getByTestId('term-reason')).toHaveTextContent('payments recorded for it stay with it');
    fireEvent.click(screen.getByTestId('term-reason-changePackage'));
    fireEvent.change(screen.getByTestId('term-months'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('term-price'), { target: { value: '2400' } });
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.correct).toHaveBeenCalledTimes(1));
    expect(h.correct.mock.calls[0][2]).toEqual({ reason: 'changePackage', months: 3, price: 2400 });
  });

  it('clearing the price makes the package free (sent as null)', async () => {
    open('correct', running);
    fireEvent.change(screen.getByTestId('term-price'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.correct).toHaveBeenCalledTimes(1));
    expect(h.correct.mock.calls[0][2]).toEqual({ reason: 'correction', price: null });
  });
});
