import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx';
import { SiteLink } from '../nav';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost';

/**
 * The site's pill button (design .mbtn). Mono uppercase label in English,
 * Arabic face without letter-case in RTL. `arrow` adds the trailing arrow that
 * nudges on hover and mirrors in RTL.
 */
export function buttonClass(variant: Variant, sm?: boolean) {
  return cx(
    'group relative inline-flex cursor-pointer items-center justify-center gap-[10px] whitespace-nowrap rounded-full border font-mono font-medium uppercase tracking-[.05em] no-underline',
    '[transition:transform_.2s_cubic-bezier(.16,1,.3,1),box-shadow_.3s_cubic-bezier(.16,1,.3,1),background_.2s,border-color_.2s,color_.2s] active:scale-[.97]',
    'rtl:font-site-ar rtl:normal-case rtl:tracking-normal',
    // size — `sm` wins over the ghost variant's own padding, as in the design's cascade
    sm ? 'min-h-[40px] px-[18px] text-[12px]' : variant === 'ghost' ? 'min-h-[42px] px-[14px] text-[13px]' : 'min-h-[50px] px-[26px] text-[13px]',
    variant !== 'secondary' && 'border-transparent',
    variant === 'primary' && 'bg-gradient-brand text-brand-ink shadow-glow hover:-translate-y-px hover:text-brand-ink hover:shadow-[0_14px_40px_rgba(255,110,2,.36)]',
    variant === 'secondary' && 'border-site-line3 bg-[rgba(255,238,228,.04)] text-earth hover:border-[rgba(255,238,228,.34)] hover:bg-[rgba(255,238,228,.08)] hover:text-earth',
    variant === 'ghost' && 'bg-transparent text-earth-muted hover:text-earth',
  );
}

export function ButtonArrow() {
  return (
    <span className="inline-flex transition-transform duration-[250ms] ease-card group-hover:translate-x-[3px] rtl:group-hover:-translate-x-[3px]">
      <Icon name="arrowR" size={16} className="rtl:-scale-x-100" />
    </span>
  );
}

interface Props {
  variant?: Variant;
  sm?: boolean;
  arrow?: boolean;
  to?: string;
  auth?: 'signup' | 'login';
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
}

export function SiteButton({ variant = 'primary', sm, arrow, to, auth, onClick, className, style, children, testId }: Props) {
  const cls = cx(buttonClass(variant, sm), className);
  const inner = (
    <>
      {children}
      {arrow && <ButtonArrow />}
    </>
  );
  if (to || auth) {
    return (
      <SiteLink to={to ?? ''} auth={auth} onClick={onClick} className={cls} style={style} data-testid={testId}>
        {inner}
      </SiteLink>
    );
  }
  return (
    // native <button>: the browser default line-height, as in the design (not the inherited 1.55)
    <button type="button" onClick={onClick} className={cx(cls, 'leading-[normal]')} style={style} data-testid={testId}>
      {inner}
    </button>
  );
}
