import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClientPayment, CoachClientRelationship } from '@/types';

/**
 * B3.8 (owner decision 1): a coach records what a client paid — cash, mobile wallet or InstaPay —
 * sees what is still owed, and fixes mistakes by reversing or correcting (never deleting).
 */
const h = vi.hoisted(() => ({
  payments: [] as ClientPayment[],
  online: true,
  record: vi.fn(async (..._a: unknown[]) => ({})),
  reverse: vi.fn(async (..._a: unknown[]) => ({})),
  correct: vi.fn(async (..._a: unknown[]) => ({})),
  confirm: vi.fn(async (..._a: unknown[]) => true),
  failOnce: false,
}));
vi.mock('@/services/platform/clientPaymentsApi', () => ({
  coachPaymentsQuery: (coachId: string) => ({ queryKey: ['coachPayments', coachId], queryFn: async () => h.payments }),
  // B3.9: the card reads one client's ledger (the server filters; the fake returns everything to prove the card still scopes).
  clientPaymentsQuery: (coachId: string, clientId: string) => ({ queryKey: ['coachPayments', coachId, clientId], queryFn: async () => h.payments }),
  recordPayment: async (...a: unknown[]) => {
    if (h.failOnce) {
      h.failOnce = false;
      throw new Error('network');
    }
    return h.record(...a);
  },
  reversePayment: h.reverse,
  correctPayment: h.correct,
}));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: h.confirm, alertDialog: async () => undefined }));
vi.mock('@/stores/toastStore', () => ({ showToast: () => undefined }));

import { ClientPaymentsCard } from './ClientPaymentsCard';

const rel: CoachClientRelationship = {
  id: 'coach-1__aya',
  coachId: 'coach-1',
  clientId: 'aya',
  status: 'active',
  createdBy: 'coach-1',
  createdAt: 1,
  updatedAt: 1,
  subscription: { status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', days: 30, months: 1, startAt: 1, endAt: Date.now() + 10 * 86_400_000, price: 1000, currency: 'EGP', termId: 'term-1', updatedAt: 1 },
};
const payment = (p: Partial<ClientPayment>): ClientPayment => ({ id: 'p1', kind: 'payment', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: 'term-1', amountMinor: 40_000, currency: 'EGP', method: 'cash', paidAt: Date.now() - 86_400_000, requestId: 'r1', createdBy: 'coach-1', createdByRole: 'coach', createdAt: 1, ...p });

async function openRecord() {
  await waitFor(() => expect(screen.getByTestId('pay-record')).toBeEnabled());
  fireEvent.click(screen.getByTestId('pay-record'));
}

function renderCard(canWrite = true, r: CoachClientRelationship = rel) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientPaymentsCard coachId="coach-1" clientId="aya" rel={r} canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.payments = [];
  h.online = true;
  h.failOnce = false;
  h.record.mockClear();
  h.reverse.mockClear();
  h.correct.mockClear();
  h.confirm.mockClear();
});

describe('balance and list', () => {
  it('price, recorded and outstanding for the current package; reversed payments count nowhere and stay listed', async () => {
    h.payments = [payment({ id: 'p1', amountMinor: 40_000 }), payment({ id: 'p2', amountMinor: 20_000, reversedById: 'r9' }), payment({ id: 'r9', kind: 'reversal', reversesId: 'p2', amountMinor: 20_000, reason: 'Typed twice' })];
    renderCard();
    expect(await screen.findByTestId('pay-recorded')).toHaveTextContent('EGP 400');
    expect(screen.getByTestId('pay-outstanding')).toHaveTextContent('EGP 600');
    const rows = screen.getAllByTestId('pay-row');
    expect(rows).toHaveLength(2); // the reversal record is shown on the payment it voids
    expect(within(rows[1]).getByTestId('pay-reversed')).toBeVisible();
    expect(rows[1]).toHaveTextContent('Reversed: Typed twice');
    expect(screen.getByText('Recorded by you. Forma does not see or verify payments.')).toBeVisible();
  });

  it('a price corrected below what was paid shows a credit, not a negative balance', async () => {
    h.payments = [payment({ amountMinor: 120_000 })];
    renderCard();
    expect(await screen.findByTestId('pay-outstanding')).toHaveTextContent('EGP 200');
    expect(screen.getByText('Credit')).toBeVisible();
  });
});

/**
 * B3.8 final review: a payment recorded without a package is money received (it is in Collected)
 * but is taken off no package's balance — the card says so, and Correct links it to a package.
 */
describe('a payment not linked to a package', () => {
  it('is listed as such, is not taken off the package balance, and the card says so; a reversed one is not mentioned', async () => {
    h.payments = [payment({ id: 'p1', termId: null, amountMinor: 50_000 }), payment({ id: 'p2', termId: null, amountMinor: 7_000, reversedById: 'r9' }), payment({ id: 'r9', kind: 'reversal', reversesId: 'p2', termId: null, amountMinor: 7_000, reason: 'x' })];
    renderCard();
    expect(await screen.findByTestId('pay-recorded')).toHaveTextContent('EGP 0');
    expect(screen.getByTestId('pay-outstanding')).toHaveTextContent('EGP 1,000');
    expect(screen.getAllByTestId('pay-row')[0]).toHaveTextContent('Not linked to a package');
    expect(screen.getByTestId('pay-unlinked')).toHaveTextContent("EGP 500 was recorded without a package: it counts as collected but isn't taken off what this client owes.");
  });

  it('no note when every live payment is linked', async () => {
    h.payments = [payment({ id: 'p1', amountMinor: 50_000 })];
    renderCard();
    await screen.findByTestId('pay-recorded');
    expect(screen.queryByTestId('pay-unlinked')).not.toBeInTheDocument();
  });

  it('linking it later: Correct, choose the package — sent as a correction for that package (the original is reversed, nothing deleted)', async () => {
    h.payments = [payment({ id: 'p1', termId: null, amountMinor: 50_000 })];
    renderCard();
    fireEvent.click(await screen.findByTestId('pay-actions'));
    fireEvent.click(screen.getByTestId('pay-correct'));
    expect(screen.getByTestId('pay-term')).toHaveValue('');
    fireEvent.change(screen.getByTestId('pay-term'), { target: { value: 'term-1' } });
    expect(screen.getByTestId('pay-amount')).toHaveValue('500');
    fireEvent.change(screen.getByTestId('pay-reason'), { target: { value: 'For the October package' } });
    fireEvent.click(screen.getByTestId('pay-save'));
    await waitFor(() => expect(h.correct).toHaveBeenCalledTimes(1));
    expect(h.correct.mock.calls[0][0]).toBe('p1');
    expect(h.correct.mock.calls[0][1]).toMatchObject({ amountMinor: 50_000, termId: 'term-1' });
  });

  it('a client with no package yet: the form says the payment will not be linked, and sends no package', async () => {
    const { subscription: _none, ...noPackage } = rel;
    renderCard(true, noPackage);
    await openRecord();
    expect(screen.getByTestId('pay-no-term')).toHaveTextContent('This client has no package to link it to yet');
    expect(screen.queryByTestId('pay-term')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('pay-amount'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('pay-save'));
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1));
    expect(h.record.mock.calls[0][1]).toMatchObject({ termId: null, amountMinor: 30_000 });
  });
});

describe('recording', () => {
  it('prefills what is left, confirms, and sends piastres with a request id', async () => {
    h.payments = [payment({ amountMinor: 40_000 })];
    renderCard();
    await openRecord();
    expect(screen.getByTestId('pay-amount')).toHaveValue('600');
    fireEvent.change(screen.getByTestId('pay-amount'), { target: { value: '250.50' } });
    fireEvent.click(screen.getByTestId('pay-method-instapay'));
    fireEvent.change(screen.getByTestId('pay-reference'), { target: { value: 'IP-42' } });
    fireEvent.click(screen.getByTestId('pay-save'));
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1));
    expect(h.confirm.mock.calls[0][0]).toMatchObject({ title: 'Record this payment?', message: expect.stringMatching(/EGP\s250\.50 paid by InstaPay/) });
    const [clientId, input, requestId] = h.record.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(clientId).toBe('aya');
    expect(input).toMatchObject({ termId: 'term-1', amountMinor: 25_050, method: 'instapay', reference: 'IP-42' });
    expect(requestId).toMatch(/^pay_/);
  });

  it('more than what is left cannot be saved; neither can a date in the future', async () => {
    h.payments = [payment({ amountMinor: 90_000 })];
    renderCard();
    await openRecord();
    fireEvent.change(screen.getByTestId('pay-amount'), { target: { value: '100.01' } });
    expect(screen.getByText('More than what is left to pay (EGP 100).')).toBeVisible();
    expect(screen.getByTestId('pay-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('pay-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('pay-date'), { target: { value: '2999-01-01' } });
    expect(screen.getByTestId('pay-save')).toBeDisabled();
  });

  it('after a failed save, Retry sends the SAME request id (recorded once, whatever happened)', async () => {
    h.failOnce = true;
    renderCard();
    await openRecord();
    fireEvent.click(screen.getByTestId('pay-save'));
    expect(await screen.findByTestId('pay-error')).toBeVisible();
    fireEvent.click(screen.getByTestId('pay-save'));
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1));
    const firstTry = h.confirm.mock.calls.length;
    expect(firstTry).toBe(2);
    expect((h.record.mock.calls[0] as unknown[])[2]).toMatch(/^pay_/);
  });

  it('offline, or with a lapsed Forma plan, recording is disabled with the reason', async () => {
    h.online = false;
    const { unmount } = renderCard();
    expect(await screen.findByTestId('pay-record')).toBeDisabled();
    unmount();
    h.online = true;
    renderCard(false);
    expect(await screen.findByTestId('pay-record')).toHaveAttribute('title', 'Your Forma subscription has lapsed. Renew it to record payments.');
  });
});

describe('fixing mistakes — never deleting', () => {
  it('reverse needs a reason and a confirmation', async () => {
    h.payments = [payment({ id: 'p1' })];
    renderCard();
    fireEvent.click(await screen.findByTestId('pay-actions'));
    fireEvent.click(screen.getByTestId('pay-reverse'));
    expect(screen.getByTestId('pay-reverse-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('pay-reverse-reason'), { target: { value: 'Recorded for the wrong client' } });
    fireEvent.click(screen.getByTestId('pay-reverse-save'));
    await waitFor(() => expect(h.reverse).toHaveBeenCalledTimes(1));
    expect(h.reverse.mock.calls[0].slice(0, 2)).toEqual(['p1', 'Recorded for the wrong client']);
  });

  it('a correction may use the amount the original held on its package', async () => {
    h.payments = [payment({ id: 'p1', amountMinor: 100_000 })];
    renderCard();
    fireEvent.click(await screen.findByTestId('pay-actions'));
    fireEvent.click(screen.getByTestId('pay-correct'));
    expect(screen.getByTestId('pay-amount')).toHaveValue('1000');
    fireEvent.change(screen.getByTestId('pay-amount'), { target: { value: '900' } });
    fireEvent.change(screen.getByTestId('pay-reason'), { target: { value: 'It was 900' } });
    fireEvent.click(screen.getByTestId('pay-save'));
    await waitFor(() => expect(h.correct).toHaveBeenCalledTimes(1));
    expect(h.correct.mock.calls[0][0]).toBe('p1');
    expect(h.correct.mock.calls[0][1]).toMatchObject({ amountMinor: 90_000, termId: 'term-1' });
    expect(h.correct.mock.calls[0][2]).toBe('It was 900');
  });
});
