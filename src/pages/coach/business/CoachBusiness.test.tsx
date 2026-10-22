import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CoachClientRelationship, CoachSubscriptionPlan, Subscription } from '@/types';

/**
 * B3.8 Me › Business (owner D1–D5): truthful month figures per currency with their meaning, current
 * clients only for due / renewals / counts, Renew on the row (the client's own term sheet), packages
 * with Move up / down instead of an order number, row-level CSV exports with a date range.
 */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NOW = at(2026, 10, 15);
const DAY = 86_400_000;

const h = vi.hoisted(() => ({
  desktop: false,
  online: true,
  canWrite: true,
  rels: [] as unknown[],
  roster: [] as unknown[],
  failBusiness: false,
  plans: [] as unknown[],
  savePlan: vi.fn(async (p: unknown) => p),
  deletePlan: vi.fn(async () => undefined),
  setTerm: vi.fn(async (..._a: unknown[]) => undefined),
  saveCsv: vi.fn(async () => 'downloaded' as const),
  summaries: [] as unknown[],
  payments: [] as unknown[],
  failPayments: false,
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsDesktop: () => h.desktop, useIsTabletUp: () => h.desktop, useMediaQuery: () => false }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/components/coach/CoachPlanProvider', async () => {
  const { useTranslation } = await import('react-i18next');
  return { useCoachPlan: () => ({ canWrite: h.canWrite, state: 'active', daysLeft: 20, plan: null }), useWriteGate: () => { const { t } = useTranslation(); const reason = !(h.canWrite) ? t('coachPlan.readOnly') : !(h.online) ? t('offline.actionDisabled') : undefined; return { canWrite: (h.canWrite) && (h.online), planBlocked: !(h.canWrite), online: h.online, reason }; } };
});
vi.mock('@/services/platform/coachBusinessApi', () => ({
  coachBusinessQuery: (id: string) => ({
    queryKey: ['coachBusiness', id],
    queryFn: async () => {
      if (h.failBusiness) throw new Error('500');
      return { rels: h.rels, roster: h.roster };
    },
    enabled: !!id,
  }),
}));
vi.mock('@/services/platform/clientPaymentsApi', () => ({
  coachPaymentsQuery: (id: string) => ({
    queryKey: ['coachPayments', id],
    queryFn: async () => {
      if (h.failPayments) throw new Error('500');
      return h.payments;
    },
    enabled: !!id,
  }),
}));
vi.mock('@/services/platform/coachPlansApi', () => ({
  listCoachPlans: async () => h.plans,
  saveCoachPlan: (p: unknown) => h.savePlan(p),
  deleteCoachPlan: (...a: unknown[]) => (h.deletePlan as (...x: unknown[]) => Promise<void>)(...a),
}));
vi.mock('@/services/platform/coachClientsApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachClientsApi')>()), renewSubscription: (...a: unknown[]) => (h.setTerm as (...x: unknown[]) => Promise<void>)(...a) }));
vi.mock('@/services/platform/coachApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachApi')>()), listClientDashboardSummaries: async () => h.summaries }));
vi.mock('@/lib/csv', async (orig) => ({ ...(await orig<typeof import('@/lib/csv')>()), saveCsv: (...a: unknown[]) => (h.saveCsv as (...x: unknown[]) => Promise<string>)(...a) }));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: async () => true, alertDialog: async () => undefined }));

import { useSession } from '@/services/auth/sessionStore';
import { CoachBusiness } from './CoachBusiness';

const sub = (p: Partial<Subscription>): Subscription => ({ startAt: at(2026, 9, 1), endAt: at(2026, 12, 1), status: 'active', price: 900, currency: 'EGP', updatedAt: at(2026, 9, 1), ...p });
const rel = (clientId: string, p: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({ id: `coach-1__${clientId}`, coachId: 'coach-1', clientId, status: 'active', createdBy: 'coach-1', createdAt: at(2026, 6, 1), updatedAt: at(2026, 6, 1), ...p });
const user = (id: string, displayName: string) => ({ id, displayName, email: `${id}@mail.test`, phone: '+201000', role: 'client', accountStatus: 'active' });
const pkg = (id: string, name: string, order: number, p: Partial<CoachSubscriptionPlan> = {}): CoachSubscriptionPlan => ({ id, coachId: 'coach-1', name, unit: 'months', duration: 1, price: 900, order, createdAt: 1, updatedAt: 1, ...p });

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderAt(path = '/coach/business') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coach/business" element={<><CoachBusiness /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  h.desktop = false;
  h.online = true;
  h.canWrite = true;
  h.failBusiness = false;
  h.savePlan.mockClear();
  h.deletePlan.mockClear();
  h.setTerm.mockClear();
  h.saveCsv.mockClear();
  useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', email: 'c@x.test', currency: 'EGP' } as never });
  h.rels = [
    rel('aya', { subscription: sub({ startAt: at(2026, 10, 10), endAt: NOW + 3 * DAY, price: 900, currency: 'EGP', planName: 'Monthly' }) }), // booked, due, renew soon
    rel('omar', { subscription: sub({ startAt: at(2026, 10, 2), endAt: NOW + 20 * DAY, price: 50, currency: 'USD' }) }), // booked in USD, renewal in 20 days
    rel('nour', { subscription: sub({ startAt: at(2026, 9, 13), endAt: NOW - 2 * DAY, price: 700, currency: 'EGP' }) }), // lapsed → lost
    rel('gone', { status: 'ended', endedAt: at(2026, 10, 5), endReason: 'released', createdAt: at(2026, 3, 1), subscription: sub({ startAt: at(2026, 10, 1), endAt: NOW + 5 * DAY, price: 999, currency: 'EGP' }) }), // former client
  ];
  h.roster = [user('aya', 'Aya Salem'), user('omar', '=Omar Adel'), user('nour', 'Nour Hany')];
  h.plans = [pkg('p1', 'Monthly', 10), pkg('p2', '3 Months', 20, { duration: 3, price: 2400 }), pkg('p3', 'Old trial', 30, { archived: true, isTrial: true, price: undefined })];
  h.summaries = [{ clientId: 'aya', lastActivity: '2026-10-14', workouts7d: 3, assessment: 'reviewed', toReview: false }];
  h.failPayments = false;
  // Aya's term has an id (written since B3.8): 400 of its 900 paid by InstaPay this month; an older cash payment was reversed.
  h.rels[0] = rel('aya', { subscription: sub({ startAt: at(2026, 10, 10), endAt: NOW + 3 * DAY, price: 900, currency: 'EGP', planName: 'Monthly', termId: 't-aya' }) });
  h.payments = [
    { id: 'p1', kind: 'payment', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: 't-aya', amountMinor: 40_000, currency: 'EGP', method: 'instapay', paidAt: at(2026, 10, 12), requestId: 'r1', createdBy: 'coach-1', createdByRole: 'coach', createdAt: at(2026, 10, 12), reference: 'IP-1' },
    { id: 'p2', kind: 'payment', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: 't-aya', amountMinor: 10_000, currency: 'EGP', method: 'cash', paidAt: at(2026, 10, 11), reversedById: 'r9', requestId: 'r2', createdBy: 'coach-1', createdByRole: 'coach', createdAt: at(2026, 10, 11) },
    { id: 'r9', kind: 'reversal', reversesId: 'p2', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: 't-aya', amountMinor: 10_000, currency: 'EGP', method: 'cash', paidAt: at(2026, 10, 13), reason: 'Typed twice', requestId: 'r3', createdBy: 'coach-1', createdByRole: 'coach', createdAt: at(2026, 10, 13) },
  ];
});

describe('Business — overview (B3.8 completion: booked ≠ collected, EGP only)', () => {
  it('this month: booked, collected, due, lost — each named for what it is; a reversed payment counts nowhere', async () => {
    renderAt();
    expect(await screen.findByTestId('biz-booked')).toHaveTextContent('EGP 1,899'); // Aya 900 + the former client's 999
    expect(screen.getByTestId('biz-collected')).toHaveTextContent('EGP 400'); // the reversed 100 is not counted
    expect(screen.getByTestId('biz-collected')).toHaveTextContent('1 payment');
    expect(screen.getByTestId('biz-due')).toHaveTextContent('EGP 900'); // Aya only — never the released client
    expect(screen.getByTestId('biz-lost')).toHaveTextContent('EGP 700'); // Nour ran out this month
    expect(screen.getByTestId('biz-reversed')).toHaveTextContent('1 payment (EGP 100) was reversed this month and is not counted.');
    expect(screen.getByTestId('biz-month-range')).toHaveTextContent('1 Oct 2026 – 31 Oct 2026');
  });

  it('overall: outstanding from packages with an id, overdue once started; older packages and other currencies are said, never mixed in', async () => {
    renderAt();
    expect(await screen.findByTestId('biz-outstanding')).toHaveTextContent('EGP 500');
    expect(screen.getByTestId('biz-overdue')).toHaveTextContent('EGP 500 overdue');
    expect(screen.getByTestId('biz-booked-all')).toHaveTextContent('EGP 2,599');
    expect(screen.getByTestId('biz-collected-all')).toHaveTextContent('EGP 400');
    expect(screen.getByTestId('biz-active-paying')).toHaveTextContent('2'); // Aya and the USD client (a running priced term) — counts are not currency-bound
    const coverage = screen.getByTestId('biz-coverage');
    expect(coverage).toHaveTextContent('2 packages from before payments could be recorded are not part of Outstanding.');
    expect(coverage).toHaveTextContent('1 older package in another currency is not counted');
    expect(screen.queryByText(/US\$50/)).not.toBeInTheDocument();
  });

  it('a payment not linked to a package is in Collected, not taken off Outstanding — and the screen says so', async () => {
    h.payments.push({ id: 'p5', kind: 'payment', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: null, amountMinor: 25_000, currency: 'EGP', method: 'cash', paidAt: at(2026, 10, 14), requestId: 'r5', createdBy: 'coach-1', createdByRole: 'coach', createdAt: at(2026, 10, 14) });
    renderAt();
    expect(await screen.findByTestId('biz-collected')).toHaveTextContent('EGP 650');
    expect(screen.getByTestId('biz-outstanding')).toHaveTextContent('EGP 500');
    expect(screen.getByTestId('biz-unlinked')).toHaveTextContent("1 payment (EGP 250) isn't linked to a package: it's in Collected but not taken off Outstanding.");
  });

  it('booked vs collected: a legend for the two series, every month readable by keyboard, and a table twin', async () => {
    renderAt();
    expect(await screen.findByTestId('biz-trend-legend')).toHaveTextContent('BookedCollected');
    const months = screen.getAllByTestId('biz-trend-month');
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toHaveAttribute('aria-label', expect.stringMatching(/October 2026 \(so far\): Booked EGP\s1,899, Collected EGP\s400/));
    expect(months.at(-1)).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByTestId('biz-trend-table-toggle'));
    const table = screen.getByTestId('biz-trend-table');
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Month', 'Booked', 'Collected']);
  });

  it('collections by method (this month / all time), the renewal pipeline and the packages clients are on', async () => {
    renderAt();
    const methods = await screen.findByTestId('biz-methods');
    expect(within(methods).getAllByTestId('biz-methods-row').map((r) => r.getAttribute('data-key'))).toEqual(['cash', 'mobile_wallet', 'instapay']);
    expect(within(methods).getAllByTestId('biz-methods-row')[2]).toHaveTextContent('InstaPay');
    const pipeline = screen.getByTestId('biz-pipeline');
    const rows = within(pipeline).getAllByTestId('biz-pipeline-row');
    expect(rows.map((r) => [r.getAttribute('data-key'), r.textContent])).toEqual([
      ['overdue', expect.stringContaining('1 client')],
      ['week', expect.stringContaining('1 client')],
      ['twoWeeks', expect.stringContaining('0 clients')],
      ['month', expect.stringContaining('1 client')],
    ]);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/coach/business?tab=renewals');
    expect(within(screen.getByTestId('biz-package-mix')).getAllByTestId('biz-package-mix-row')[0]).toHaveTextContent('Monthly');
    expect(screen.getByTestId('biz-count-expiring')).toHaveAttribute('href', '/coach/clients?state=expiring');
  });

  it('the definitions say what each figure is — and that profit is not shown', async () => {
    renderAt();
    const defs = await screen.findByTestId('biz-definitions');
    expect(defs).toHaveTextContent('It is not money received.');
    expect(defs).toHaveTextContent('Forma does not see or verify them');
    expect(defs).toHaveTextContent("isn't shown: Forma doesn't know your costs.");
    expect(screen.queryByText(/retention|churn|MRR/i)).not.toBeInTheDocument();
  });

  it('payments failing to load is partial data: booked still shows; collected and outstanding say they did not load', async () => {
    h.failPayments = true;
    renderAt();
    expect(await screen.findByTestId('biz-payments-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('biz-booked')).toHaveTextContent('EGP 1,899');
    expect(screen.getByTestId('biz-collected')).toHaveTextContent('Not loaded');
    expect(screen.getByTestId('biz-outstanding')).toHaveTextContent('Not loaded');
  });

  it('a failed load says so with Retry — never zero', async () => {
    h.failBusiness = true;
    renderAt();
    const err = await screen.findByTestId('coach-business-error');
    expect(err).toHaveAttribute('role', 'alert');
    expect(within(err).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByTestId('biz-booked')).not.toBeInTheDocument();
  });

  it('tabs live in the URL; one tab stop', async () => {
    renderAt('/coach/business?tab=packages');
    expect(await screen.findByTestId('coach-subscription-plans')).toBeInTheDocument();
    expect(screen.getByTestId('biz-tab-packages')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('biz-tab-overview'));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/coach\/business$/);
  });
});

describe('Business — renewals (JR-03 / CO-16)', () => {
  it('names every current client ending within 30 days and every lapsed one; never a former client', async () => {
    renderAt('/coach/business?tab=renewals');
    const upcoming = await screen.findByTestId('biz-upcoming-list');
    const rows = within(upcoming).getAllByTestId('biz-row');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Aya Salem'), expect.stringContaining('=Omar Adel')]);
    expect(rows[0]).toHaveTextContent('Ends in 3 days');
    expect(within(screen.getByTestId('biz-lapsed-list')).getByTestId('biz-row')).toHaveTextContent('Ran out 2 days ago');
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
  });

  it('Renew (Fix C) books the NEXT package from the day after the running one ends, at its price, once', async () => {
    renderAt('/coach/business?tab=renewals');
    const aya = (await screen.findAllByTestId('biz-row'))[0];
    fireEvent.click(within(aya).getByRole('button', { name: "Renew Aya Salem's package" }));
    // Aya's package runs until 18 Oct: the renewal starts 19 Oct — fixed, not a date field.
    expect(await screen.findByTestId('term-renew-start')).toHaveTextContent('19 Oct 2026');
    expect(screen.queryByTestId('term-start')).toBeNull();
    fireEvent.click(screen.getByTestId('term-save'));
    await waitFor(() => expect(h.setTerm).toHaveBeenCalledTimes(1));
    const [coachId, clientId, term, requestId] = h.setTerm.mock.calls[0] as unknown as [string, string, Record<string, unknown>, string];
    expect([coachId, clientId]).toEqual(['coach-1', 'aya']);
    expect(term).toEqual({ months: 1, price: 900, planName: 'Monthly' });
    expect(requestId).toMatch(/^term_/);
  });

  it('offline or with a lapsed Forma plan, Renew is disabled with the reason', async () => {
    h.online = false;
    renderAt('/coach/business?tab=renewals');
    const btn = within((await screen.findAllByTestId('biz-row'))[0]).getByTestId('biz-renew');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', "You're offline — reconnect to do this.");
  });

  it('desktop: a table with real column names; the row opens Package & billing', async () => {
    h.desktop = true;
    renderAt('/coach/business?tab=renewals');
    const table = await screen.findByTestId('biz-upcoming-list');
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Client', 'Ends', 'Package', 'Price', 'Action', 'Actions']);
    fireEvent.click(within(table).getAllByTestId('row-open')[0]);
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/client/aya/subscription');
  });
});

describe('Business — packages (TB-06 / CO-36 / D4)', () => {
  it('rows open a sheet with Delete inside; no "Order" field; archived ones are marked', async () => {
    renderAt('/coach/business?tab=packages');
    const rows = await screen.findAllByTestId('coach-plan-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[2]).getByTestId('coach-plan-archived')).toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByTestId('row-open'));
    const form = await screen.findByTestId('coach-plan-form');
    expect(within(form).queryByTestId('coach-plan-order')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByTestId('coach-plan-delete'));
    await waitFor(() => expect(h.deletePlan).toHaveBeenCalledWith('coach-1', 'p1'));
  });

  it('Move down swaps two packages and saves only the ones whose position changed', async () => {
    renderAt('/coach/business?tab=packages');
    const rows = await screen.findAllByTestId('coach-plan-row');
    expect(within(rows[0]).getByRole('button', { name: 'Move Monthly up' })).toBeDisabled();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Move Monthly down' }));
    await waitFor(() => expect(h.savePlan).toHaveBeenCalledTimes(2));
    const saved = h.savePlan.mock.calls.map((c) => c[0] as CoachSubscriptionPlan).map((p) => [p.id, p.order, p.name]);
    expect(saved).toEqual([['p2', 10, '3 Months'], ['p1', 20, 'Monthly']]);
  });

  it('a new package needs a name and a valid price; it saves after the last one', async () => {
    renderAt('/coach/business?tab=packages');
    fireEvent.click(await screen.findByTestId('coach-plan-add'));
    const save = await screen.findByTestId('coach-plan-save');
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId('coach-plan-name'), { target: { value: 'Six weeks' } });
    fireEvent.change(screen.getByTestId('coach-plan-price'), { target: { value: 'abc' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId('coach-plan-price'), { target: { value: '١٢٠٠' } }); // Arabic digits
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.savePlan).toHaveBeenCalledTimes(1));
    expect(h.savePlan.mock.calls[0][0]).toMatchObject({ name: 'Six weeks', price: 1200, order: 40 });
  });
});

describe('Business — exports (D3)', () => {
  it('clients: one CSV row per current client in the range, formulas neutralised', async () => {
    renderAt('/coach/business?tab=exports');
    const btn = await screen.findByTestId('biz-export-clients');
    expect(btn).toHaveTextContent('Export 3 clients');
    fireEvent.click(btn);
    await waitFor(() => expect(h.saveCsv).toHaveBeenCalledTimes(1));
    const [name, csv] = h.saveCsv.mock.calls[0] as unknown as [string, string];
    expect(name).toBe('forma-clients-2026-10-15');
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Name,Email,Phone,Package status,Package,First day,Last day,Price,Currency,Client since,Last workout,Workouts (last 7 days),Assessment');
    expect(lines).toHaveLength(4);
    expect(lines.find((l) => l.startsWith('Aya Salem'))).toBe('Aya Salem,aya@mail.test,+201000,Expiring,Monthly,2026-10-10,2026-10-18,900,EGP,2026-06-01,2026-10-14,3,Reviewed');
    expect(lines.some((l) => l.startsWith("'=Omar Adel"))).toBe(true);
  });

  it('terms: current and former clients inside the range; a former client is named as such', async () => {
    renderAt('/coach/business?tab=exports');
    fireEvent.change(await screen.findByTestId('biz-export-from'), { target: { value: '2026-10-01' } });
    const btn = screen.getByTestId('biz-export-terms');
    expect(btn).toHaveTextContent('Export 3 terms'); // Aya, Omar and the former client started in October; Nour in September
    fireEvent.click(btn);
    await waitFor(() => expect(h.saveCsv).toHaveBeenCalledTimes(1));
    const csv = (h.saveCsv.mock.calls[0] as unknown as [string, string])[1];
    expect(csv).toContain('Former client,gone,Former client — left 2026-10-05,Current term,2026-10-01');
    expect(csv).not.toContain('Nour Hany');
  });

  it('payments: every record in the range, reconcilable — live payments, the reversed one marked, its reversal pointing at it', async () => {
    renderAt('/coach/business?tab=exports');
    const btn = await screen.findByTestId('biz-export-payments');
    await waitFor(() => expect(btn).toHaveTextContent('Export 3 payment records'));
    fireEvent.click(btn);
    await waitFor(() => expect(h.saveCsv).toHaveBeenCalledTimes(1));
    const [name, csv] = h.saveCsv.mock.calls[0] as unknown as [string, string];
    expect(name).toBe('forma-payments-2026-10-15');
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Date,Client,Client ID,Status,Method,Amount,Currency,Package (first day),Package ID,Reference,Note / reason,Record ID,Reverses / corrects,Recorded on');
    expect(lines[1]).toBe('2026-10-11,Aya Salem,aya,Reversed,Cash,100,EGP,2026-10-10,t-aya,,,p2,,2026-10-11');
    expect(lines[2]).toBe('2026-10-12,Aya Salem,aya,Recorded,InstaPay,400,EGP,2026-10-10,t-aya,IP-1,,p1,,2026-10-12');
    expect(lines[3]).toBe('2026-10-13,Aya Salem,aya,Reversal,Cash,-100,EGP,2026-10-10,t-aya,,Typed twice,r9,p2,2026-10-13');
  });

  it('payments: a payment not linked to a package says so in the package column', async () => {
    h.payments.push({ id: 'p5', kind: 'payment', coachId: 'coach-1', clientId: 'aya', relationshipId: 'coach-1__aya', termId: null, amountMinor: 25_000, currency: 'EGP', method: 'cash', paidAt: at(2026, 10, 14), requestId: 'r5', createdBy: 'coach-1', createdByRole: 'coach', createdAt: at(2026, 10, 14) });
    renderAt('/coach/business?tab=exports');
    const btn = await screen.findByTestId('biz-export-payments');
    await waitFor(() => expect(btn).toHaveTextContent('Export 4 payment records'));
    fireEvent.click(btn);
    await waitFor(() => expect(h.saveCsv).toHaveBeenCalledTimes(1));
    const csv = (h.saveCsv.mock.calls[0] as unknown as [string, string])[1];
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[4]).toBe('2026-10-14,Aya Salem,aya,Recorded,Cash,250,EGP,Not linked to a package,,,,p5,,2026-10-14');
  });

  it('a range that ends before it starts disables the exports and says why', async () => {
    renderAt('/coach/business?tab=exports');
    fireEvent.change(await screen.findByTestId('biz-export-from'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByTestId('biz-export-to'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('“From” is after “To”.');
    expect(screen.getByTestId('biz-export-clients')).toBeDisabled();
    expect(screen.getByTestId('biz-export-terms')).toBeDisabled();
  });
});
