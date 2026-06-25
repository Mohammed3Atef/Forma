import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Standard empty state: a centered icon + title + optional message and action,
 * inside a card. Replaces the bare muted-text divs scattered across the app.
 */
export function EmptyState({
  icon = 'info',
  title,
  message,
  action,
  tone = 'default',
  className = '',
  testId,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
  tone?: 'default' | 'brand';
  className?: string;
  testId?: string;
}) {
  const iconWrap =
    tone === 'brand'
      ? 'border-brand/30 bg-brand/10 text-brand'
      : 'border-line bg-surface-raised text-earth-muted';
  return (
    <div className={`card flex flex-col items-center gap-3 py-10 text-center ${className}`} data-testid={testId}>
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${iconWrap}`}>
        <Icon name={icon} size={26} />
      </span>
      <div>
        <p className="font-display text-base font-semibold">{title}</p>
        {message ? <p className="mx-auto mt-1 max-w-sm text-sm text-earth-muted">{message}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
