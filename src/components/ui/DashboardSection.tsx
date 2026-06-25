import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * A titled dashboard section with a real <section>/<h2> landmark (screen-reader
 * navigable), an optional leading icon and a trailing action (e.g. "View all").
 */
export function DashboardSection({
  title,
  icon,
  action,
  children,
  className = '',
  testId,
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em]">
          {icon ? <Icon name={icon} size={17} className="text-brand" /> : null}
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
