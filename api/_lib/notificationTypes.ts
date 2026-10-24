/**
 * Every notification type the platform knows — the ONE server-side list
 * (B1.9). Both server unions derive from it; the client's taxonomy
 * (`src/lib/notificationTaxonomy.ts`) is tested against it.
 */
export const NOTIFICATION_TYPES = [
  'coach_note',
  'plan_assigned',
  'targets_updated',
  'subscription_updated',
  'freeze_decided',
  'measurement_added',
  'assessment_reviewed',
  'freeze_requested',
  'assessment_submitted',
  'checkin_requested',
  'checkin_submitted',
  'checkin_reviewed',
  'message_received',
  'trial_expiring',
  'plan_change_requested',
  'plan_decided',
  'coach_assigned',
  'client_released',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
