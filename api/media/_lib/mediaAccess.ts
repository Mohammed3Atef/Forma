import type { AuthedUser } from '../../_trpc/context.js';
import { hasPermission } from '../../_lib/rbac.js';
import { getAssignedCoachId, isAssignedCoach, resolveThreadViewer } from '../../messages/_data.js';
import type { PersonalCategory } from './delivery.js';

/**
 * MD-02 — who may see a piece of personal media (and so get a signed URL for it). The owner; an
 * oversight account (`users.read`); a message attachment's thread participants (the client, their
 * CURRENT coach — `resolveThreadViewer`); the client's CURRENT coach for their photos; a client for
 * their current coach's avatar. A coach the client has left, another coach or another client: no.
 */
export async function canSeePersonalMedia(user: AuthedUser, ownerId: string, category: PersonalCategory): Promise<boolean> {
  if (user.id === ownerId) return true;
  if (hasPermission(user.role, user.accountStatus, user.permissions, 'users.read')) return true;
  if (category === 'messages') {
    try {
      await resolveThreadViewer(user, ownerId);
      return true;
    } catch {
      return false;
    }
  }
  if (user.role === 'coach') return isAssignedCoach(user.id, ownerId);
  if (user.role === 'client' && category === 'avatar') return (await getAssignedCoachId(user.id)) === ownerId;
  return false;
}
