import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';

export interface QuickAction {
  key: string;
  icon: IconName;
  label: string;
  /** Short supporting text under the label — sheet rows only, the grid stays icon+label. */
  helper?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Omit entirely (e.g. permission-gated) rather than show disabled. */
  hidden?: boolean;
}

const GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5';

/**
 * The visible action-card grid — unchanged from the original always-on
 * design, just given a name so it can pair with `QuickActionsTrigger` below
 * `hiddenBelow`. Desktop/tablet keep this; only phones collapse to the "+"
 * sheet, per the approved pattern: never hide useful actions behind "+" once
 * there's room for them.
 */
export function QuickActionsGrid({
  actions,
  className = '',
  hiddenBelow = 'md',
}: {
  actions: QuickAction[];
  className?: string;
  hiddenBelow?: 'md' | 'lg';
}) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  return (
    <div className={`${hiddenBelow === 'md' ? 'hidden md:grid' : 'hidden lg:grid'} ${GRID_CLASSES} ${className}`}>
      {visible.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          className="card card-hover flex items-center gap-3 text-start disabled:opacity-40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
            <Icon name={a.icon} size={18} />
          </span>
          <span className="min-w-0 truncate text-sm font-medium">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Compact mobile counterpart: a single 44×44 "+" that opens a bottom Sheet
 * listing the same actions as rows (icon + title + optional supporting
 * text). Pair with `QuickActionsGrid` using the same `hiddenBelow` value —
 * together they show exactly one of the two at any width, never both.
 */
export function QuickActionsTrigger({
  actions,
  title,
  className = '',
  hiddenAbove = 'md',
}: {
  actions: QuickAction[];
  title: string;
  className?: string;
  hiddenAbove?: 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        data-testid="quick-actions-trigger"
        className={`icon-btn h-11 w-11 ${hiddenAbove === 'md' ? 'md:hidden' : 'lg:hidden'} ${className}`}
      >
        <Icon name="plus" size={20} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="-mx-5 -mb-8 divide-y divide-line-soft md:-mx-6 md:-mb-6">
          {visible.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className="rowline w-full text-start disabled:opacity-40"
            >
              <span className="tk-ic">
                <Icon name={a.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{a.label}</span>
                {a.helper && <span className="block truncate text-[12px] text-earth-subtle">{a.helper}</span>}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
