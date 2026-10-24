import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Lists as rows, not cards (B2, doc 17 "Section + ListRow"). One row shape for
 * every list: leading (icon tile / avatar / tick), title, one meta line,
 * trailing (value, status, one action, or a chevron that mirrors in RTL).
 * 56px rows; dividers are hairlines from the group, never per-row borders.
 */

export type TileTone = 'brand' | 'success' | 'info' | 'warn' | 'neutral';
const TILE: Record<TileTone, string> = {
  brand: 'bg-brand/[0.13] text-brand-hover',
  success: 'bg-success/[0.14] text-success',
  info: 'bg-info/[0.14] text-info',
  warn: 'bg-warn/[0.14] text-warn',
  neutral: 'bg-white/[0.06] text-earth-muted',
};

/** A tinted icon square (the website's `MIc`). */
export function IconTile({ icon, tone = 'neutral', size = 40 }: { icon: IconName; tone?: TileTone; size?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-ui-control ${TILE[tone]}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** A section of a screen: a real heading, an optional action, no box. */
export function Section({
  title,
  action,
  children,
  className = '',
  testId,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={className} data-testid={testId}>
      {title || action ? (
        <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
          {title ? <h2 className="text-[17px] font-semibold leading-tight">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Rows that belong together, on one quiet surface with hairline dividers. */
export function ListGroup({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-ui-surface border border-white/[0.07] bg-surface-card ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  chevron = false,
  onClick,
  to,
  testId,
  className = '',
  muted = false,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Show a forward chevron (mirrors in RTL) after `trailing`. */
  chevron?: boolean;
  onClick?: () => void;
  to?: string;
  testId?: string;
  className?: string;
  /** Done / secondary rows read quieter. */
  muted?: boolean;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-semibold leading-snug ${muted ? 'text-earth-muted' : ''}`}>{title}</span>
        {meta ? <span className="mt-0.5 block truncate text-[13px] leading-snug text-earth-muted">{meta}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {chevron ? <Icon name="chevron" size={18} className="shrink-0 text-earth-subtle" /> : null}
    </>
  );
  const cls = `flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start ${className}`;
  if (to) {
    return (
      <Link to={to} className={`${cls} transition-colors hover:bg-white/[0.03]`} data-testid={testId}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-white/[0.03]`} data-testid={testId}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}
