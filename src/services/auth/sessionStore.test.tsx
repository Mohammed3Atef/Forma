import { describe, expect, it, vi } from 'vitest';

vi.mock('./mongoAuth', () => ({ mongoAuth: { signOutUser: vi.fn(async () => undefined), me: vi.fn(async () => { throw new Error('Not authenticated'); }) } }));

import { queryClient } from '@/services/platform/queryClient';
import { useSession } from './sessionStore';

/**
 * S-1: the shared QueryClient outlives a session. Without clearing it on
 * sign-out, the next account on the same device rendered the previous
 * account's cached rosters / plan requests until each query refetched.
 */
describe('session end clears server-state cache', () => {
  it('signOut() empties the query cache', async () => {
    queryClient.setQueryData(['coachPlanRequest', 'mine'], { id: 'coach-A-request' });
    queryClient.setQueryData(['myClients', 'coach-A'], [{ id: 'client-1' }]);
    await useSession.getState().signOut();
    expect(queryClient.getQueryData(['coachPlanRequest', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useSession.getState().phase).toBe('anonymous');
  });

  it('a failed account refresh (session gone) also empties it', async () => {
    queryClient.setQueryData(['users'], [{ id: 'x' }]);
    await useSession.getState().refreshAccount({ silent: true });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
