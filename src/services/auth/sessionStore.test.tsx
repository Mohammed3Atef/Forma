import { beforeEach, describe, expect, it, vi } from 'vitest';

const me = vi.fn();
const signOutUser = vi.fn(async () => true);
vi.mock('./mongoAuth', () => ({ mongoAuth: { signOutUser: () => signOutUser(), me: () => me() } }));
const refreshSessionDetailed = vi.fn();
const takeRefreshedUser = vi.fn((): unknown => null);
vi.mock('@/services/platformApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platformApi')>()),
  refreshSessionDetailed: () => refreshSessionDetailed(),
  takeRefreshedUser: () => takeRefreshedUser(),
}));

import { queryClient } from '@/services/platform/queryClient';
import { hasPendingSignOut, useSession } from './sessionStore';
import type { UserRecord } from '@/types';

const unauthorized = () => Object.assign(new Error('Not authenticated'), { data: { code: 'UNAUTHORIZED' } });
const offline = () => new TypeError('Failed to fetch');
const account = (id = 'client-a'): UserRecord => ({ id, email: `${id}@t.test`, displayName: id, role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'x', createdAt: 1, updatedAt: 1 }) as UserRecord;

beforeEach(() => {
  localStorage.clear();
  me.mockReset();
  signOutUser.mockReset();
  signOutUser.mockResolvedValue(true);
  refreshSessionDetailed.mockReset();
  takeRefreshedUser.mockReset();
  takeRefreshedUser.mockReturnValue(null);
  useSession.setState({ phase: 'anonymous', uid: null, account: null, verified: false, error: null });
});

/**
 * S-1: the shared QueryClient outlives a session. Without clearing it on
 * sign-out, the next account on the same device rendered the previous
 * account's cached rosters / plan requests until each query refetched.
 */
describe('session end clears server-state cache', () => {
  it('signOut() empties the query cache', async () => {
    queryClient.setQueryData(['coachPlanRequests', 'mine'], { id: 'coach-A-request' });
    queryClient.setQueryData(['myClients', 'coach-A'], [{ id: 'client-1' }]);
    await useSession.getState().signOut();
    expect(queryClient.getQueryData(['coachPlanRequests', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useSession.getState().phase).toBe('anonymous');
  });

  it('a server-confirmed end of session (401 + refresh refused) also empties it', async () => {
    useSession.getState().hydrate(account());
    queryClient.setQueryData(['users'], [{ id: 'x' }]);
    me.mockRejectedValue(unauthorized());
    refreshSessionDetailed.mockResolvedValue('unauthorized');
    await useSession.getState().refreshAccount({ silent: true });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useSession.getState().phase).toBe('anonymous');
  });
});

describe('the query cache belongs to one account (B1.12)', () => {
  it('another tab switched the account: the refresh that brings user B drops user A cached reads', async () => {
    useSession.getState().hydrate(account('coach-a'));
    queryClient.setQueryData(['coachCommercial', 'mine', 'coach-a'], { owner: 'a' });
    queryClient.setQueryData(['coachDashboard'], { owner: 'a' });
    takeRefreshedUser.mockReturnValue(account('coach-b'));
    await useSession.getState().refreshAccount({ silent: true });
    expect(useSession.getState().uid).toBe('coach-b');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('a refresh of the SAME account keeps the cache', async () => {
    useSession.getState().hydrate(account('coach-a'));
    queryClient.setQueryData(['coachDashboard'], { owner: 'a' });
    takeRefreshedUser.mockReturnValue(account('coach-a'));
    await useSession.getState().refreshAccount({ silent: true });
    expect(queryClient.getQueryData(['coachDashboard'])).toEqual({ owner: 'a' });
  });
});

describe('a network failure is never a sign-out (PWA-01)', () => {
  it('offline on foreground: the signed-in client stays signed in, cache kept, marked unverified', async () => {
    useSession.getState().hydrate(account());
    queryClient.setQueryData(['myCoach'], { id: 'c' });
    me.mockRejectedValue(offline());
    await useSession.getState().refreshAccount({ silent: true });
    expect(useSession.getState()).toMatchObject({ phase: 'ready', uid: 'client-a', verified: false });
    expect(queryClient.getQueryData(['myCoach'])).toEqual({ id: 'c' });
  });

  it('a 5xx / timeout from the refresh endpoint keeps the session', async () => {
    useSession.getState().hydrate(account());
    me.mockRejectedValue(unauthorized()); // access token expired…
    refreshSessionDetailed.mockResolvedValue('error'); // …and the refresh endpoint is down
    await useSession.getState().refreshAccount({ silent: true });
    expect(useSession.getState()).toMatchObject({ phase: 'ready', uid: 'client-a', verified: false });
  });

  it('reverify() after reconnect re-verifies the session', async () => {
    useSession.getState().hydrate(account());
    useSession.setState({ verified: false });
    refreshSessionDetailed.mockResolvedValue('ok');
    me.mockResolvedValue(account());
    await useSession.getState().reverify();
    expect(useSession.getState().verified).toBe(true);
  });
});

describe('signing out offline is final (PWA-08)', () => {
  it('an unreachable logout leaves a marker that blocks every automatic restore', async () => {
    useSession.getState().hydrate(account());
    signOutUser.mockResolvedValue(false); // offline: the refresh cookie could not be revoked
    await useSession.getState().signOut();
    expect(useSession.getState().phase).toBe('anonymous');
    expect(hasPendingSignOut()).toBe(true);
    // Back online / foreground: the surviving cookie must NOT sign the user back in.
    refreshSessionDetailed.mockResolvedValue('ok');
    me.mockResolvedValue(account());
    await useSession.getState().reverify();
    expect(useSession.getState().phase).toBe('anonymous');
    expect(me).not.toHaveBeenCalled();
    expect(refreshSessionDetailed).not.toHaveBeenCalled();
  });

  it('an explicit sign-in clears the marker', async () => {
    signOutUser.mockResolvedValue(false);
    await useSession.getState().signOut();
    useSession.getState().hydrate(account('client-b'));
    expect(hasPendingSignOut()).toBe(false);
    expect(useSession.getState().uid).toBe('client-b');
  });

  it('a real anonymous state (no failed restore) is never auto-restored on foreground', async () => {
    refreshSessionDetailed.mockResolvedValue('ok');
    await useSession.getState().reverify();
    expect(refreshSessionDetailed).not.toHaveBeenCalled();
    expect(useSession.getState().phase).toBe('anonymous');
  });
});

describe('boot uses the user the refresh already returned (B1.13 / PF-01)', () => {
  it('no second auth.me round-trip after a successful refresh', async () => {
    takeRefreshedUser.mockReturnValue(account('client-a'));
    await useSession.getState().refreshAccount({ silent: true });
    expect(me).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ uid: 'client-a', phase: 'ready', verified: true });
  });
  it('without a fresh refresh answer it still asks the server', async () => {
    me.mockResolvedValue(account('client-b'));
    await useSession.getState().refreshAccount({ silent: true });
    expect(me).toHaveBeenCalledTimes(1);
    expect(useSession.getState().uid).toBe('client-b');
  });
});
