import type { ReactNode } from 'react';

/**
 * Shared desktop master/detail layout — replaces three near-identical
 * hand-rolled `flex gap-5` + `w-80 shrink-0` panes (CoachClients, AdminCoaches,
 * CoachMessages). Callers keep deciding WHEN to render this (all three already
 * collapse to a single-pane mobile/tablet layout below `useIsDesktop()`'s
 * 1024px via their own JS branch — that part isn't broken and stays put here);
 * this component only owns the pane proportions. The detail pane was a flat
 * `w-80` (320px) at every width ≥1024px, cramping the main pane right at the
 * 1024–1279px edge — `w-64 xl:w-80` gives it less room until there's actually
 * space to spare (≥1280px).
 */
export function SplitPane({
  main,
  detail,
  detailPosition = 'end',
  testId,
}: {
  main: ReactNode;
  detail: ReactNode;
  /** CoachMessages' inbox list is the fixed-width pane but reads first (list → thread); everyone else's fixed pane is a trailing preview. */
  detailPosition?: 'start' | 'end';
  testId?: string;
}) {
  const mainPane = <div className="min-w-0 flex-1">{main}</div>;
  const detailPane = <div className="w-64 shrink-0 xl:w-80">{detail}</div>;
  return (
    <div className="flex gap-5" data-testid={testId}>
      {detailPosition === 'start' ? (
        <>
          {detailPane}
          {mainPane}
        </>
      ) : (
        <>
          {mainPane}
          {detailPane}
        </>
      )}
    </div>
  );
}
