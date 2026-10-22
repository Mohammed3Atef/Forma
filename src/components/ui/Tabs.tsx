import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { focusItem, rovingIndex } from '@/lib/rovingKeys';

export interface TabDef {
  key: string;
  label: string;
  icon?: IconName;
}

/**
 * URL-synced active tab via a query param (`?tab=`), so tabs are shareable,
 * back-button friendly and e2e-testable. Falls back to `fallback` when absent.
 */
export function useTabParam(param = 'tab', fallback = ''): [string, (key: string) => void] {
  const [params, setParams] = useSearchParams();
  const active = params.get(param) || fallback;
  const set = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params);
      if (key === fallback) next.delete(param);
      else next.set(param, key);
      setParams(next, { replace: true });
    },
    [params, setParams, param, fallback],
  );
  return [active, set];
}

/**
 * Premium segmented tab bar. Scrolls horizontally on mobile, never overflows.
 * Accessible: role="tablist"/"tab" + aria-selected. One brand system everywhere
 * (admin no longer gets a separate cool accent — see Forma design system v2).
 */
export function Tabs({
  tabs,
  active,
  onChange,
  testIdPrefix,
  className = '',
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  testIdPrefix?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const onColor = 'bg-gradient-brand text-brand-ink';
  return (
    <div
      role="tablist"
      aria-label={t('common.sections')}
      className={`-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab, i) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={on}
            // B3.9 (AX-05): one tab stop for the whole bar; arrows / Home / End move and select.
            tabIndex={on ? 0 : -1}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.key}` : undefined}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => {
              const next = rovingIndex(e, i, tabs.length);
              if (next < 0) return;
              e.preventDefault();
              focusItem(e, next, '[role="tab"]');
              onChange(tabs[next].key);
            }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-mono text-[12px] font-medium uppercase tracking-[0.04em] transition-colors ${
              on ? onColor : 'border border-line bg-surface-card text-earth-muted hover:bg-surface-hover hover:text-earth'
            }`}
          >
            {tab.icon ? <Icon name={tab.icon} size={15} /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented control (B1.3): a small set of mutually exclusive options that
 * switch a view in place (not navigation — that's `Tabs`). Radio semantics,
 * so screen readers announce "1 of 3, selected". Built on the `.seg` styles.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  testIdPrefix,
  className = '',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`seg ${className}`}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          // B3.9 (AX-05): a radio group is one tab stop; arrows move the selection.
          tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? 'on' : ''}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const next = rovingIndex(e, i, options.length, 'both');
            if (next < 0) return;
            e.preventDefault();
            focusItem(e, next, '[role="radio"]');
            onChange(options[next].value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
