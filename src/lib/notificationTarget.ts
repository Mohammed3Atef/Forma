import type { AppNotification } from '@/types';
import { clientNoteRoute, openClientNote } from './noteTarget';
import { ROLE_HOME, safeRolePath, type RoleSpace } from './navContract';

/**
 * Where tapping a notification lands (B1.9 / B1.10) — ONE resolver for the
 * feed rows and the toasts. Types whose action lives on a known screen go
 * there regardless of the route stored on the row (rows written before a fix
 * keep their old route — e.g. NAV-K03: a pause request used to open the
 * client's Overview, where the request isn't shown). Any stored route is
 * validated against the viewer's own screens.
 */
export function notificationTarget(n: AppNotification, viewer: RoleSpace): string {
  if (viewer === 'admin') return safeRolePath(n.route, 'admin');
  if (viewer === 'coach') return coachTarget(n);
  if (n.type === 'message_received') return '/messages';
  if ((n.type === 'checkin_requested' || n.type === 'checkin_reviewed') && n.entityId) return `/check-in/${encodeURIComponent(n.entityId)}`;
  return safeRolePath(clientNoteRoute({ ...n, route: safeRolePath(n.route, 'client', '') || undefined }), 'client');
}

function coachTarget(n: AppNotification): string {
  const c = encodeURIComponent(n.clientId);
  const ws = `/coach/client/${c}`;
  switch (n.type) {
    case 'message_received':
      return `/coach/messages/${c}`;
    case 'checkin_submitted':
      return `${ws}/checkins`;
    case 'assessment_submitted':
      return `${ws}/assessment`;
    case 'freeze_requested':
      return `${ws}/subscription`; // the request card lives on Subscription (NAV-K03)
    case 'trial_expiring':
    case 'plan_decided':
      return '/coach/plan';
    default:
      return safeRolePath(n.route, 'coach', ROLE_HOME.coach);
  }
}

/**
 * The user TAPPED it: for a client this may also arm the scroll-to-highlight
 * focus and show the note's day (only a tap may change app state, B0 / NT-02).
 */
export function openNotification(n: AppNotification, viewer: RoleSpace): string {
  const target = notificationTarget(n, viewer);
  if (viewer === 'client' && n.type !== 'message_received') openClientNote({ ...n, route: target });
  return target;
}
