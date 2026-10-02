import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const getPublicForma = vi.fn();
vi.mock('@/services/platform/coachPlanTiersApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanTiersApi')>()),
  getPublicForma: () => getPublicForma(),
}));
// Reveal animates on intersection — render children straight away in jsdom.
vi.mock('../Reveal', () => ({ Reveal: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }));

import { Pricing } from './Pricing';

const forma = {
  key: 'forma',
  marketingTitle: { en: 'Forma', ar: 'فورما' },
  marketingDescription: { en: 'One plan. Everything included.', ar: '' },
  marketingFeatures: { en: ['Complete client tracking', '100% Coach-Led — No AI replacing you'], ar: [] },
  priceMonthly: 499,
  currency: 'EGP',
  billingInterval: 'month',
  maxClients: 25,
  trialEnabled: true,
  trialDurationDays: 15,
  trialClientLimit: 25,
  signupEnabled: true,
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => getPublicForma.mockReset());

describe('Marketing pricing', () => {
  it('renders exactly ONE Forma card from the config, with the Start Free Trial CTA', async () => {
    getPublicForma.mockResolvedValue(forma);
    renderIt();
    expect(await screen.findAllByTestId('landing-pricing-card')).toHaveLength(1);
    expect(screen.getByTestId('pricing-title')).toHaveTextContent('Forma');
    expect(screen.getByTestId('pricing-trial')).toHaveTextContent('15-day Free Trial');
    expect(screen.getByTestId('pricing-clients')).toHaveTextContent('Up to 25 clients');
    expect(screen.getByTestId('pricing-price')).toHaveTextContent('499 EGP');
    expect(screen.getByText('All features included')).toBeInTheDocument();
    expect(screen.getByText('One plan. Everything included.', { selector: 'h2' })).toBeInTheDocument();
    const cta = screen.getByTestId('pricing-cta');
    expect(cta).toHaveTextContent('Start Free Trial');
    expect(cta).toHaveAttribute('href', '/login?signup=1');
    // No multi-plan UX.
    expect(screen.queryByText(/choose plan|change plan|upgrade/i)).toBeNull();
  });

  it('closed sign-up shows a notice instead of the CTA', async () => {
    getPublicForma.mockResolvedValue({ ...forma, signupEnabled: false });
    renderIt();
    expect(await screen.findByTestId('pricing-signup-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('pricing-cta')).toBeNull();
  });

  it('renders nothing when the Super Admin hides Forma from the public site', async () => {
    getPublicForma.mockResolvedValue(null);
    renderIt();
    await waitFor(() => expect(getPublicForma).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('landing-pricing')).toBeNull());
  });
});
