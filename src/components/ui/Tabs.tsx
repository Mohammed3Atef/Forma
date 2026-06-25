import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';

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
 * Accessible: role="tablist"/"tab" + aria-selected. Copper active by default;
 * pass accent="system" for the cooler admin tone.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  testIdPrefix,
  accent = 'brand',
  className = '',
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  testIdPrefix?: string;
  accent?: 'brand' | 'system';
  className?: string;
}) {
  const onColor = accent === 'system' ? 'bg-system text-white' : 'bg-brand text-white';
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className={`-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={on}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.key}` : undefined}
            onClick={() => onChange(tab.key)}
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
