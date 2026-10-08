import type { ReactNode } from 'react';

export type PillTone = 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'mute';

const TONE_CLASS: Record<PillTone, string> = {
  ok: 'pill-ok',
  warn: 'pill-warn',
  bad: 'pill-bad',
  info: 'pill-info',
  brand: 'pill-brand',
  mute: 'pill-mute',
};

/**
 * Canonical status badge — rounded pill + leading dot, one of six semantic
 * tones. Backed by the `.pill`/`.pill-*` classes in src/index.css. Use this
 * instead of hand-rolling a `.chip` + tone-color map per screen (subscription
 * status, coach state, audit-log severity, etc. all want the same shape).
 */
export function Pill({
  tone = 'mute',
  dot = true,
  children,
  className = '',
  testId,
}: {
  tone?: PillTone;
  /** Show the leading colored dot (default). Set false for a plain text badge. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span className={`pill ${TONE_CLASS[tone]} ${className}`} data-testid={testId}>
      {dot ? <span className="pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * StatusChip (B1.3) — the evolved Pill: same six tones, on the type scale
 * (12px floor, VS-04) and announced as a status. New and migrated screens use
 * this; legacy `Pill` call sites keep their 10px size until they move (B2/B3).
 */
export function StatusChip({ tone = 'mute', dot = true, children, className = '', testId }: Parameters<typeof Pill>[0]) {
  return (
    <span role="status" className="contents">
      <Pill tone={tone} dot={dot} className={`text-[12px] tracking-[0.06em] ${className}`} testId={testId}>
        {children}
      </Pill>
    </span>
  );
}
