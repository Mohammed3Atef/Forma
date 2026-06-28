import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from './EmptyState';

/**
 * Standard "you don't have access" state — shown instead of a blank screen or a
 * silent redirect when a user lacks permission for a Coach/Admin surface.
 */
export function PermissionState({
  title,
  message,
  action,
  testId = 'permission-state',
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="shield"
      title={title ?? t('state.permissionTitle')}
      message={message ?? t('state.permissionBody')}
      action={action}
      testId={testId}
    />
  );
}
