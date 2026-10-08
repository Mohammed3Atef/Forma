import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AppNotification } from '@/types';

let feed: { items: AppNotification[]; unread: number; loading: boolean } = { items: [], unread: 0, loading: true };
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ ...feed, isCoach: false, isAdmin: false, error: false, retry: () => undefined }) }));
vi.mock('@/services/platform/notificationsApi', () => ({ markNotificationSeen: vi.fn(async () => undefined) }));
vi.mock('@/services/platform/clientCoachApi', () => ({ fetchMyCoach: vi.fn(async () => ({ displayName: 'Coach K' })) }));
vi.mock('@/services/platform/coachApi', () => ({ listMyClients: vi.fn(async () => []) }));

import { NotificationBell } from './NotificationBell';
import { useSession } from '@/services/auth/sessionStore';
import { useToasts } from '@/stores/toastStore';
import { useDay } from '@/stores/dayStore';
import { today } from '@/lib/utils';
import type { UserRecord } from '@/types';

const now = Date.now();
const note = (id: string, createdAt: number, over: Partial<AppNotification> = {}): AppNotification =>
  ({ id, clientId: 'client-1', forRole: 'client', type: 'coach_note', body: 'Check this meal', screen: 'nutrition', date: '2026-09-25', entityType: 'meal', entityId: 'm1', seenAt: null, createdAt, createdBy: 'coach-1', updatedAt: createdAt, ...over }) as AppNotification;

function mount() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const toasts = () => useToasts.getState().toasts;

beforeEach(() => {
  localStorage.clear();
  useToasts.setState({ toasts: [] } as never);
  useDay.setState({ selected: today() });
  useSession.setState({ phase: 'ready', uid: 'client-1', account: { id: 'client-1', role: 'client', assignedCoachId: 'coach-1' } as UserRecord });
});

describe('notification toasts (NT-01 / NT-02)', () => {
  it('cold open with an unread backlog (incl. dated coach notes): no toasts, the day is untouched', async () => {
    feed = { items: [note('a', now - 60_000), note('b', now - 3 * 86_400_000)], unread: 2, loading: false };
    mount();
    expect(toasts()).toHaveLength(0);
    expect(useDay.getState().selected).toBe(today());
  });

  it('the backlog is not replayed on the next launch / reload either', async () => {
    feed = { items: [note('a', now - 60_000)], unread: 1, loading: false };
    const first = mount();
    first.unmount();
    // App relaunched: same unread items, the baseline survived on the device.
    mount();
    expect(toasts()).toHaveLength(0);
  });

  it('a notification that arrives after the baseline toasts once — without moving the day until tapped', async () => {
    feed = { items: [note('a', now - 60_000)], unread: 1, loading: false };
    const view = mount();
    const fresh = note('new', Date.now() + 1000);
    feed = { items: [fresh, note('a', now - 60_000)], unread: 2, loading: false };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].body).toContain('Check this meal');
    expect(useDay.getState().selected).toBe(today()); // building the toast changed nothing
    act(() => toasts()[0].onClick?.());
    expect(useDay.getState().selected).toBe('2026-09-25'); // the tap did
  });

  it('nothing is toasted while the feed is still loading, and stale items are never toasted', async () => {
    feed = { items: [], unread: 0, loading: true };
    mount();
    expect(localStorage.length).toBe(0); // no baseline taken from an unloaded feed
    // Device has a mark from days ago; items arrived long ago (not "just now").
    localStorage.setItem('forma.notifToastMark.v1.client-1', String(now - 5 * 86_400_000));
    feed = { items: [note('old', now - 2 * 86_400_000)], unread: 1, loading: false };
    mount();
    expect(toasts()).toHaveLength(0);
  });
});
