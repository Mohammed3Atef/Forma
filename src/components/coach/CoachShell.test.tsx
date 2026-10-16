import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/hooks/useCoachMessageUnread', () => ({ useCoachMessageUnread: () => 3 }));
vi.mock('@/components/NotificationBell', () => ({ NotificationBell: () => <span data-testid="bell-stub" /> }));

import { useSession } from '@/services/auth/sessionStore';
import { setNavGuard } from '@/stores/navGuardStore';
import { CoachShell } from './CoachShell';

/**
 * B3.1 — the coach shell: one navigation system (Today · Clients · Messages ·
 * Library + Me), the right destination lit for every screen, one Back owner
 * per screen, and every shell exit through the unsaved-changes guard.
 */
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <CoachShell>
                <Where />
              </CoachShell>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', displayName: 'Coach Pro', email: 'pro@forma.test' } as never });
});
afterEach(() => setNavGuard(null));

describe('CoachShell', () => {
  it('shows the four destinations as tabs and in the rail, Clients lit inside a client, the unread badge on Messages', () => {
    renderAt('/coach/client/c1/workout');
    const tabs = screen.getByTestId('bottom-nav');
    for (const key of ['today', 'clients', 'messages', 'library']) expect(tabs.querySelector(`[data-testid="nav-${key}"]`)).not.toBeNull();
    expect(screen.getByTestId('nav-clients')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('rail-clients')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-today')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-messages-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('coach-rail')).toBeInTheDocument();
    // No hamburger, no WhatsApp button, no old sidebar.
    expect(screen.queryByTestId('nav-menu-button')).toBeNull();
    expect(screen.queryByTestId('whatsapp-fab')).toBeNull();
    expect(screen.queryByTestId('coach-sidebar')).toBeNull();
  });

  it('roots carry no Back; a Me page gets the shell Back; a page with its own Back gets none', () => {
    const { unmount } = renderAt('/coach/dashboard');
    expect(screen.queryByTestId('shell-back')).toBeNull();
    unmount();
    const plan = renderAt('/coach/plan');
    expect(screen.getByTestId('shell-back')).toBeInTheDocument();
    expect(screen.getByTestId('me-button')).toHaveAttribute('aria-current', 'page');
    plan.unmount();
    renderAt('/coach/client/c1');
    expect(screen.queryByTestId('shell-back')).toBeNull();
  });

  it('a dirty editor keeps the coach on the page when a tab, the rail or Me is used and they choose to stay', async () => {
    const check = vi.fn(async () => false);
    renderAt('/coach/client/c1/workout');
    act(() => setNavGuard(check));
    fireEvent.click(screen.getByTestId('nav-today'));
    fireEvent.click(screen.getByTestId('rail-library'));
    fireEvent.click(screen.getByTestId('me-button'));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/client/c1/workout');
  });

  it('…and leaves when they confirm; with nothing dirty the tab just navigates', async () => {
    renderAt('/coach/client/c1/workout');
    act(() => setNavGuard(async () => true));
    fireEvent.click(screen.getByTestId('nav-messages'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/messages'));
    act(() => setNavGuard(null));
    fireEvent.click(screen.getByTestId('rail-library'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/library'));
    fireEvent.click(screen.getByTestId('rail-me'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/me'));
  });
});
