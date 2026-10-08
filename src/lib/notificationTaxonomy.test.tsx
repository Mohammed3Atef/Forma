import { describe, expect, it } from 'vitest';
import type { AppNotification, NotificationType } from '@/types';
import { NOTIFICATION_TYPES as SERVER_TYPES } from '../../api/_lib/notificationTypes';
import { bellCount, coalesceFeed, NOTIFICATION_TAXONOMY, NOTIFICATION_TYPES } from './notificationTaxonomy';
import { notificationTarget } from './notificationTarget';

const n = (over: Partial<AppNotification> & { type: NotificationType }): AppNotification =>
  ({ id: Math.random().toString(36).slice(2), clientId: 'c1', forRole: 'coach', seenAt: null, createdAt: 1, createdBy: 'x', updatedAt: 1, ...over }) as AppNotification;

describe('notification taxonomy (B1.9)', () => {
  it('covers exactly the server type list — a new type cannot ship without a taxonomy entry', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...SERVER_TYPES].sort());
  });

  it('every task type is resolved by the server when done; reserved types are marked as not produced', () => {
    const tasks = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_TAXONOMY[t].category === 'task');
    expect(tasks.sort()).toEqual(['assessment_submitted', 'checkin_requested', 'checkin_submitted', 'freeze_requested', 'plan_change_requested']);
    expect(NOTIFICATION_TYPES.filter((t) => !NOTIFICATION_TAXONOMY[t].produced).sort()).toEqual(['client_released', 'coach_assigned', 'plan_assigned', 'plan_decided', 'subscription_updated', 'trial_expiring']);
  });

  it('a chatty thread is ONE feed row; other rows stay separate', () => {
    const rows = coalesceFeed([
      n({ type: 'message_received', id: 'm3' }),
      n({ type: 'checkin_submitted', id: 'k1' }),
      n({ type: 'message_received', id: 'm2', seenAt: 5 }),
      n({ type: 'message_received', id: 'm1' }),
      n({ type: 'message_received', id: 'o1', clientId: 'c2' }),
    ]);
    expect(rows.map((r) => r.rep.id)).toEqual(['m3', 'k1', 'o1']);
    expect(rows[0]).toMatchObject({ count: 3, unreadCount: 2, unseen: true });
  });

  it('the bell counts unseen rows, never chat messages (the Messages badge counts those once)', () => {
    const items = [
      n({ type: 'message_received' }),
      n({ type: 'message_received' }),
      n({ type: 'checkin_submitted' }),
      n({ type: 'assessment_submitted', seenAt: 3 }),
      n({ type: 'freeze_requested' }),
    ];
    expect(bellCount(items)).toBe(2);
  });
});

describe('notification deep links land where the action is (B1.9 / NAV-K03)', () => {
  it("a coach's pause-request notification opens the client's Subscription tab — even an old row with the Overview route", () => {
    expect(notificationTarget(n({ type: 'freeze_requested', route: '/coach/client/c1' }), 'coach')).toBe('/coach/client/c1/subscription');
  });

  it('coach task types open their workspace tab; messages open the thread', () => {
    expect(notificationTarget(n({ type: 'checkin_submitted' }), 'coach')).toBe('/coach/client/c1/checkins');
    expect(notificationTarget(n({ type: 'assessment_submitted' }), 'coach')).toBe('/coach/client/c1/assessment');
    expect(notificationTarget(n({ type: 'message_received' }), 'coach')).toBe('/coach/messages/c1');
  });

  it('client: check-ins open the check-in, messages the inbox, anchored notes their screen', () => {
    expect(notificationTarget(n({ type: 'checkin_requested', forRole: 'client', entityId: '2026-10-05' }), 'client')).toBe('/check-in/2026-10-05');
    expect(notificationTarget(n({ type: 'message_received', forRole: 'client' }), 'client')).toBe('/messages');
    expect(notificationTarget(n({ type: 'targets_updated', forRole: 'client', screen: 'nutrition' }), 'client')).toBe('/nutrition');
  });

  it('a stored route outside the viewer’s own screens is never followed', () => {
    for (const route of ['https://evil.example/x', '//evil.example', '/admin/accounts', '/coach/clients', 'javascript:alert(1)', '/a/../coach']) {
      expect(notificationTarget(n({ type: 'coach_note', forRole: 'client', route }), 'client')).toBe('/');
    }
    expect(notificationTarget(n({ type: 'coach_assigned', route: '/messages' }), 'coach')).toBe('/coach');
    expect(notificationTarget(n({ type: 'plan_change_requested', route: '/coach/plan' }), 'admin')).toBe('/admin');
    expect(notificationTarget(n({ type: 'plan_change_requested', route: '/admin/plans?tab=requests' }), 'admin')).toBe('/admin/plans?tab=requests');
  });
});
