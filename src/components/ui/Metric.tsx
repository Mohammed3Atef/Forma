import { createContext, useContext, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Inside a `MetricGroup` a metric is a cell of one shared surface, not its own card. */
const InGroup = createContext(false);

/**
 * The coach app's one KPI tile (B3.9, CD-02 / RM-31): label · value · what it counts. Promoted from
 * Business › Overview (B3.8) so the workspace progress views use the same tile. Numbers are set
 * left-to-right and isolated; a unit follows in the page's direction (RTL-06). A `to` makes the
 * whole tile a link. Admin screens keep `MetricCard`; the old shared `StatTile` is gone (the marketing
 * page has its own, untouched).
 */
export function Metric({
  label,
  value,
  unit,
  sub,
  to,
  testId,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  to?: string;
  testId?: string;
  tone?: 'warn' | 'ok';
}) {
  const grouped = useContext(InGroup);
  const body = (
    <>
      <p className="text-[12.5px] font-medium text-earth-muted">{label}</p>
      <p className={`mt-1 truncate text-[22px] font-semibold leading-tight sm:text-[24px] ${tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-success' : 'text-earth'}`}>
        <bdi dir="ltr" data-testid={testId ? `${testId}-value` : undefined}>
          {value}
        </bdi>
        {unit ? <span className="ms-1 text-[14px] font-normal text-earth-muted">{unit}</span> : null}
      </p>
      {sub ? <div className="mt-1 text-[12px] leading-snug text-earth-subtle">{sub}</div> : null}
    </>
  );
  const shell = grouped ? 'min-w-0 bg-surface-card p-4' : 'card min-w-0';
  return to ? (
    <Link to={to} className={`${shell} block transition-colors hover:bg-surface-hover`} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={shell} data-testid={testId}>
      {body}
    </div>
  );
}

/**
 * Related metrics on ONE surface with hairline dividers (B3.9, CD-01): a row of four numbers reads as
 * one block instead of four equal boxes. Two columns on phones, four from `lg`.
 */
export function MetricGroup({ children, cols = 4, className = '', testId }: { children: ReactNode; cols?: 2 | 4; className?: string; testId?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-ui-surface border border-white/[0.07] bg-white/[0.06] ${cols === 4 ? 'lg:grid-cols-4' : ''} ${className}`} data-testid={testId}>
      <InGroup.Provider value>{children}</InGroup.Provider>
    </div>
  );
}
