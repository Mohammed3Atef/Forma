import { useRef, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '@/components/Icon';

export interface SectionTab<T extends string> {
  key: T;
  label: string;
  icon?: IconName;
}

/**
 * In-page sections of one screen (B3.7, VS-14 / doc 17 "Tabs", underline variant): up to four equal
 * tabs that always fit — no scrolling strip, no chips — with the client workspace's underline
 * look. Tab semantics with one tab stop (roving `tabindex`): arrow keys move between tabs in reading
 * order (reversed in right-to-left), Home / End jump to the ends; the content is the `tabpanel`
 * named by `panelId`. Switching is the caller's (e.g. a `?tab=` replace).
 */
export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  panelId,
  testIdPrefix,
  className = '',
}: {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Id of the element that renders the active section (`role="tabpanel"`). */
  panelId: string;
  testIdPrefix?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    let next = -1;
    if (step) next = (i + step + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].key);
  };
  return (
    // Tabs share the width by their label lengths (flex: 1 1 auto) — a long label such as
    // "Supplements" keeps its full width at 360 px instead of being cut to an equal quarter.
    <div role="tablist" aria-label={label} className={`flex border-b border-white/[0.07] ${className}`}>
      {tabs.map((tab, i) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.key}`}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.key}` : undefined}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative -mb-px flex min-h-11 min-w-0 flex-auto items-center justify-center gap-1.5 px-1.5 text-[13px] font-medium transition-colors sm:px-2 sm:text-[14px] ${on ? 'text-earth' : 'text-earth-subtle hover:text-earth'}`}
          >
            {tab.icon ? <Icon name={tab.icon} size={15} className="hidden shrink-0 sm:block" /> : null}
            <span className="truncate">{tab.label}</span>
            {on && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-brand" />}
          </button>
        );
      })}
    </div>
  );
}
