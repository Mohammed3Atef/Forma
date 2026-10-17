import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Banner } from '@/services/platform/bannersApi';

/**
 * NT-10 (owner, 2026-10-17): a dismissed informational announcement stays
 * dismissed for that signed-in user across app launches, until it changes
 * materially; a warning is never permanently dismissible; another account on
 * the same device is unaffected. Coach (Today) and client (home) alike.
 */
const h = vi.hoisted(() => ({ banners: [] as Banner[], fail: false }));
vi.mock('@/services/platform/bannersApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/bannersApi')>()),
  fetchBannersForViewer: async () => {
    if (h.fail) throw new Error('offline');
    return h.banners;
  },
}));

import { useSession } from '@/services/auth/sessionStore';
import { BannerHost } from './BannerHost';

function banner(over: Partial<Banner> = {}): Banner {
  return {
    id: 'b1', title: 'New: weekly check-in templates', body: 'Try them in Library', style: 'info', placement: 'all', roles: [], segment: 'all', active: true,
    createdBy: 'admin', createdAt: 1, updatedAt: 1, ...over,
  };
}
function signIn(uid: string, role: 'coach' | 'client') {
  useSession.setState({ uid, account: { id: uid, role, accountStatus: 'active', createdAt: 1, displayName: uid, email: `${uid}@x.test` } as never });
}
/** One "app launch": mount the host on the role's home. */
function launch(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BannerHost />
    </MemoryRouter>,
  );
}
/** A new launch starts a new session (the tab / app was closed). */
function relaunch(path: string, prev: { unmount: () => void }) {
  prev.unmount();
  sessionStorage.clear();
  return launch(path);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  h.banners = [banner()];
  h.fail = false;
});

describe('BannerHost dismissals (NT-10)', () => {
  it('coach: a dismissed announcement stays dismissed on the next launch', async () => {
    signIn('coach-1', 'coach');
    const first = launch('/coach/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('app-banner')).toBeNull();
    relaunch('/coach/dashboard', first);
    await act(async () => undefined);
    expect(screen.queryByTestId('app-banner')).toBeNull();
  });

  it('client: the same on the home screen', async () => {
    signIn('client-1', 'client');
    const first = launch('/');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    relaunch('/', first);
    await act(async () => undefined);
    expect(screen.queryByTestId('app-banner')).toBeNull();
  });

  it('a materially changed announcement (new title / body / link / style) shows again; a new one shows', async () => {
    signIn('coach-1', 'coach');
    const first = launch('/coach/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    h.banners = [banner({ title: 'Updated: weekly check-in templates', updatedAt: 2 })];
    const second = relaunch('/coach/dashboard', first);
    expect(await screen.findByTestId('app-banner')).toHaveTextContent('Updated: weekly check-in templates');
    h.banners = [banner({ title: 'Updated: weekly check-in templates', updatedAt: 3 }), banner({ id: 'b2', title: 'Holiday hours' })];
    relaunch('/coach/dashboard', second);
    await waitFor(() => expect(screen.getAllByTestId('app-banner')).toHaveLength(2));
  });

  it('a warning announcement is dismissed for this session only — it returns on the next launch', async () => {
    h.banners = [banner({ style: 'warning', title: 'Scheduled maintenance tonight' })];
    signIn('coach-1', 'coach');
    const first = launch('/coach/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    first.unmount();
    const sameSession = launch('/coach/dashboard'); // e.g. navigating back to Today
    await act(async () => undefined);
    expect(screen.queryByTestId('app-banner')).toBeNull();
    relaunch('/coach/dashboard', sameSession);
    expect(await screen.findByTestId('app-banner')).toHaveTextContent('Scheduled maintenance tonight');
  });

  it('account switching on one device: one user\'s dismissals never hide it for another', async () => {
    signIn('coach-1', 'coach');
    launch('/coach/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    act(() => signIn('coach-2', 'coach'));
    expect(await screen.findByTestId('app-banner')).toBeInTheDocument();
    act(() => signIn('coach-1', 'coach'));
    await waitFor(() => expect(screen.queryByTestId('app-banner')).toBeNull());
  });

  it('offline relaunch: no announcements and no crash; the dismissal is still remembered when back online', async () => {
    signIn('client-1', 'client');
    const first = launch('/');
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    h.fail = true;
    const offline = relaunch('/', first);
    await act(async () => undefined);
    expect(screen.queryByTestId('app-banner')).toBeNull();
    h.fail = false;
    relaunch('/', offline);
    await act(async () => undefined);
    expect(screen.queryByTestId('app-banner')).toBeNull();
  });
});
