import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const listCapacityPackages = vi.fn();
const saveCapacityPackage = vi.fn();
const listPlanRequests = vi.fn();
const confirmPlanRequest = vi.fn();
vi.mock('@/services/platform/coachCommercialApi', () => ({
  listCapacityPackages: (a: boolean) => listCapacityPackages(a),
  saveCapacityPackage: (i: unknown) => saveCapacityPackage(i),
  setCapacityPackageState: vi.fn(),
  reorderCapacityPackages: vi.fn(),
}));
vi.mock('@/services/platform/coachPlanRequestsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanRequestsApi')>()),
  listPlanRequests: (f: unknown) => listPlanRequests(f),
  confirmPlanRequest: (id: string, note?: string) => confirmPlanRequest(id, note),
  rejectPlanRequest: vi.fn(),
}));
vi.mock('@/services/platform/coachPlanTiersApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanTiersApi')>()),
  getFormaConfig: vi.fn(async () => ({ priceMonthly: 499, maxClients: 25, currency: 'EGP' })),
}));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: vi.fn(async () => true), alertDialog: vi.fn(async () => undefined) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

import { CapacityPackagesTab } from './CapacityPackagesTab';
import { PaymentRequestsTab } from './PaymentRequestsTab';

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  listCapacityPackages.mockReset();
  saveCapacityPackage.mockReset();
  listPlanRequests.mockReset();
  confirmPlanRequest.mockReset();
});

describe('Admin capacity package form', () => {
  it('validates required fields and saves a new package with bilingual fallback handled by the API layer', async () => {
    listCapacityPackages.mockResolvedValue([]);
    saveCapacityPackage.mockResolvedValue({ id: 'p1' });
    wrap(<CapacityPackagesTab />);
    fireEvent.click(await screen.findByTestId('package-add'));
    const form = await screen.findByTestId('package-form');
    const save = within(form).getByTestId('package-save');
    expect(save).toBeDisabled(); // name + price required
    fireEvent.change(within(form).getByTestId('package-name-en'), { target: { value: '+20 clients' } });
    fireEvent.change(within(form).getByTestId('package-price'), { target: { value: '199' } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(saveCapacityPackage).toHaveBeenCalled());
    expect(saveCapacityPackage.mock.calls[0][0]).toMatchObject({ name: { en: '+20 clients' }, additionalClients: 20, price: 199, billingInterval: 'month', durationMonths: 1, active: true, coachVisible: true });
  });

  it('lists packages with state badges and holder counts', async () => {
    listCapacityPackages.mockResolvedValue([
      { id: 'p1', name: { en: '+20 clients', ar: '' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1, active: true, coachVisible: false, sortOrder: 0, createdAt: 0, updatedAt: 0, activeHolders: 3 },
    ]);
    wrap(<CapacityPackagesTab />);
    const card = await screen.findByTestId('package-card');
    expect(card).toHaveTextContent('+20');
    expect(card).toHaveTextContent('Admin-only');
    expect(card).toHaveTextContent('3 active holder(s)');
  });
});

describe('Admin payment confirmation', () => {
  const row = {
    id: 'r1', coachId: 'c1', coachName: 'Ahmed', coachEmail: 'a@x', type: 'capacity_addon', status: 'awaiting', requestedAt: Date.now(), confirmationDeadline: Date.now() + 5 * 3_600_000,
    capacitySnapshot: { packageId: 'p1', name: { en: '+20 clients', ar: '' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1 },
    currentPlan: { phase: 'forma', state: 'active', maxClients: 25, activeClientCount: 25 },
  };

  it('desktop table and mobile cards both open the same detail; confirming sends the request id', async () => {
    listPlanRequests.mockResolvedValue([row]);
    confirmPlanRequest.mockResolvedValue({ ...row, status: 'confirmed' });
    wrap(<PaymentRequestsTab />);
    // Both layouts are rendered (CSS picks one per breakpoint) with the same action.
    expect(await screen.findByTestId('request-row')).toHaveTextContent('Ahmed');
    const card = screen.getByTestId('request-card');
    expect(card).toHaveTextContent('199 EGP / month');
    fireEvent.click(card);
    const detail = await screen.findByTestId('request-detail');
    expect(within(detail).getByTestId('request-detail-amount')).toHaveTextContent('199 EGP / month');
    fireEvent.click(within(detail).getByTestId('request-confirm'));
    await waitFor(() => expect(confirmPlanRequest).toHaveBeenCalledWith('r1', undefined));
  });
});
