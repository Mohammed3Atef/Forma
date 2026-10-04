import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx';
import s from './site.module.css';

/** Centered content column (design .wrap). */
export function Wrap({ narrow, className, style, children }: { narrow?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cx('mx-auto w-full px-[clamp(20px,5vw,40px)]', narrow ? 'max-w-[900px]' : 'max-w-[1240px]', className)} style={style}>
      {children}
    </div>
  );
}

/** Blurred colour glow (design .halo). Position/size/colour come from the caller. */
export function Halo({ style }: { style: CSSProperties }) {
  return <div aria-hidden="true" className="pointer-events-none absolute rounded-full opacity-[.55] blur-[90px]" style={style} />;
}

/** Film-grain overlay (design .grain::after) — render as the LAST child of a positioned element. */
export function Grain({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx(s.grain, className)} />;
}

/** Faint background grid (design .gridbg). */
export function GridBg({ style }: { style?: CSSProperties }) {
  return <div aria-hidden="true" className={s.gridbg} style={style} />;
}

/** Visually hidden text (design .sr). */
export function Sr({ children }: { children: ReactNode }) {
  return <span className="absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]">{children}</span>;
}
