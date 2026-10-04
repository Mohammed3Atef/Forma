import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx';
import type { IconName } from '../icons';
import { Icon } from './Icon';
import { mkClass } from './mock';
import f from './frames.module.css';

/**
 * Desktop product window (design .pf.mk). A container, and its mock text
 * scales with the viewport (cqw on the frame itself resolves against the
 * viewport, as in the design). Always left-to-right: the mocks show the
 * English app, so in Arabic they must not mirror or reorder their sample text.
 */
export function ProductFrame({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      dir="ltr"
      className={cx(
        f.pf,
        mkClass,
        'rtl:font-sans',
        'relative overflow-hidden rounded-2xl border border-site-line2 bg-surface-card text-[clamp(6px,1.42cqw,12px)] shadow-[0_28px_70px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,238,228,.06)] [container-type:inline-size]',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/** Browser chrome strip on a product window (design .pf-bar). */
export function ProductBar({ url }: { url: string }) {
  return (
    <div className="flex h-[2.6em] items-center gap-[.5em] border-b border-site-line bg-surface-raised px-[1.1em]">
      <i className="h-[.7em] w-[.7em] rounded-full bg-[rgba(255,238,228,.14)]" />
      <i className="h-[.7em] w-[.7em] rounded-full bg-[rgba(255,238,228,.14)]" />
      <i className="h-[.7em] w-[.7em] rounded-full bg-[rgba(255,238,228,.14)]" />
      <span className="mx-auto rounded-full bg-surface-card px-[1.2em] py-[.25em] font-mono text-[.82em] text-site-tx3">{url}</span>
    </div>
  );
}

/**
 * Phone (design .phone + .notch + .phone-s). Everything inside is sized in cqw
 * of the phone, so it scales as one object. `screenClass` adds to the screen.
 */
export function PhoneFrame({ screenClass, children }: { screenClass?: string; children: ReactNode }) {
  return (
    <div dir="ltr" className="relative aspect-[9/19] rtl:font-sans rounded-[15%/7.1%] bg-[#090706] p-0 shadow-[0_40px_90px_rgba(0,0,0,.6),inset_0_0_0_1.5px_rgba(255,238,228,.14),0_0_0_1px_#000] [container-type:inline-size]">
      <div className="absolute left-1/2 top-[2.6cqw] z-[5] h-[7.5cqw] w-[28cqw] -translate-x-1/2 rounded-full bg-black" />
      <div className={cx('absolute inset-[3.2cqw] flex flex-col overflow-hidden rounded-[12cqw] bg-surface', screenClass)}>{children}</div>
    </div>
  );
}

/** Phone status bar (design .pstat). */
export function PhoneStatus() {
  return (
    <div className="flex h-[13cqw] flex-none items-center justify-between px-[8cqw] pt-[4.5cqw] font-mono text-[3.6cqw] text-earth-muted">
      <span>9:41</span>
      <span>●●●</span>
    </div>
  );
}

/** The phone's mock text root (design .phone-s .mk). */
export const phoneMk = cx(mkClass, 'text-[4.1cqw]');

export type PhoneTab = 'today' | 'fuel' | 'train' | 'progress' | 'inbox';
const TABS: { id: PhoneTab; icon: IconName; label?: string }[] = [
  { id: 'today', icon: 'home', label: 'Today' },
  { id: 'fuel', icon: 'meal', label: 'Fuel' },
  { id: 'train', icon: 'dumbbell' },
  { id: 'progress', icon: 'chart', label: 'Progress' },
  { id: 'inbox', icon: 'msg', label: 'Inbox' },
];

/**
 * Client-app tab bar (design .m-tab) with the centre "train" action button.
 * Static in the hero; a real tablist in the app story (`onSelect`).
 */
export function PhoneTabBar({ active, onSelect, badge }: { active?: PhoneTab; onSelect?: (tab: PhoneTab) => void; badge?: number }) {
  return (
    <div
      className="flex h-[15cqw] flex-none items-start justify-around border-t border-site-line bg-surface-card pt-[2.2cqw]"
      role={onSelect ? 'tablist' : undefined}
      aria-label={onSelect ? 'Client app tabs' : undefined}
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        const fab = tab.id === 'train';
        return (
          <span
            key={tab.id}
            role={onSelect ? 'tab' : undefined}
            data-goto={onSelect ? tab.id : undefined}
            aria-selected={onSelect ? on : undefined}
            aria-label={fab && onSelect ? 'Train' : undefined}
            onClick={onSelect ? () => onSelect(tab.id) : undefined}
            className={cx(
              'relative flex w-[17cqw] flex-col items-center gap-[1cqw] font-mono text-[2.4cqw] uppercase tracking-[.04em]',
              on ? 'text-brand-hover' : 'text-site-tx3',
              fab && '-mt-[5.5cqw]',
              onSelect && 'cursor-pointer',
            )}
          >
            {fab ? (
              <b className="grid h-[12.5cqw] w-[12.5cqw] place-items-center rounded-full bg-gradient-brand text-brand-ink shadow-[0_0_0_1.4cqw_#141110,0_10px_30px_rgba(255,110,2,.24)]">
                <Icon name={tab.icon} size="6cqw" />
              </b>
            ) : (
              <>
                <Icon name={tab.icon} size="5.4cqw" />
                {tab.label}
              </>
            )}
            {tab.id === 'inbox' && badge ? (
              <i className="absolute end-[3cqw] -top-[1cqw] grid h-[3.6cqw] min-w-[3.6cqw] place-items-center rounded-full bg-gradient-brand text-[2.3cqw] not-italic leading-[1.6] text-brand-ink">{badge}</i>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** Floating glass card (design .fcard); its mock text scales with the card. */
export function FloatCard({ children }: { children: ReactNode }) {
  return (
    <div dir="ltr" className="rounded-2xl border border-site-line2 rtl:font-sans bg-[rgba(27,23,20,.92)] p-[14px] shadow-[0_12px_34px_rgba(0,0,0,.44),inset_0_1px_0_rgba(255,238,228,.06)] backdrop-blur-[8px] [container-type:inline-size]">
      {children}
    </div>
  );
}
