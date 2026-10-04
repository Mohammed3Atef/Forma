import type { CSSProperties, ReactNode, Ref } from 'react';
import { cx } from '../cx';
import { Grain, Wrap } from './layout';
import a from './ambient.module.css';

/** Two soft radial glows behind a section (design main>section::after and its per-section --ga/--gb/--gx… vars). */
export interface Glow {
  gx: string;
  gy: string;
  hx: string;
  hy: string;
  ga?: string;
  gb?: string;
}
const DEFAULT_GLOW: Required<Pick<Glow, 'ga' | 'gb'>> = {
  ga: 'rgba(255,139,2,.16)',
  gb: 'rgba(255,178,8,.09)',
};

function trail(flip: boolean, k: number) {
  const d = flip ? 'M1240 40 C 980 120, 820 300, 560 360 S 160 420, -40 620' : 'M-40 80 C 220 140, 420 320, 680 360 S 1080 400, 1240 600';
  const d2 = flip ? 'M1240 120 C 1000 200, 860 380, 600 430 S 180 520, -40 700' : 'M-40 160 C 240 210, 440 390, 700 430 S 1100 480, 1240 680';
  const id = `tg${k}`;
  return (
    <svg viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1={flip ? 1 : 0} y1="0" x2={flip ? 0 : 1} y2="0">
          <stop offset="0" stopColor="#FF8B02" stopOpacity="0" />
          <stop offset=".45" stopColor="#FFB208" stopOpacity=".55" />
          <stop offset=".7" stopColor="#FF8B02" stopOpacity=".35" />
          <stop offset="1" stopColor="#FF4C01" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className={a.tr} d={d} stroke={`url(#${id})`} strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />
      <path className={cx(a.tr, a.t2)} d={d2} stroke={`url(#${id})`} strokeWidth="1" fill="none" opacity=".55" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Ambient motifs by section position k (design site.js): a light trail on even
 * sections (mirrored every 4th), the Forma mark on k%3==1, a dot field on k%3==2.
 */
export function Ambient({ k }: { k: number }) {
  const trailOn = k % 2 === 0;
  const mark = k % 3 === 1;
  const dots = k % 3 === 2;
  if (!trailOn && !mark && !dots) return null;
  return (
    <div className={a.amb} aria-hidden="true">
      {trailOn && <div className={a.trail}>{trail(k % 4 === 2, k)}</div>}
      {mark && <span className={cx(a.mark, k % 2 ? a.markR : a.markL)} />}
      {dots && <span className={a.dots} />}
    </div>
  );
}

interface Props {
  id?: string;
  /** Position on the page (0 = hero) — selects the ambient motifs. */
  k: number;
  glow?: Glow;
  /**
   * Film grain instead of the glow. In the design .grain::after and the glow are the SAME
   * pseudo-element, so grain sections (hero, final) get no glow and the grain sits at z-index −1.
   */
  grain?: boolean;
  /** Standard section rhythm (design section.sec). */
  sec?: boolean;
  className?: string;
  style?: CSSProperties;
  labelledBy?: string;
  /**
   * position:relative (default). The Contact grid section is NOT positioned in the design, so
   * its glow and ambient mark spread over the whole <main> — pass false to keep that.
   */
  positioned?: boolean;
  /** Ambient motifs on/off (the legal pages have none). */
  ambient?: boolean;
  /** For sections that measure themselves (scroll scenes). */
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
}

/** A top-level home/page section: ambient motifs, content, then the section glow. */
export function Section({ id, k, glow, grain, sec = true, className, style, labelledBy, positioned = true, ambient = true, sectionRef, children }: Props) {
  const g = {
    gx: '12%',
    gy: '18%',
    hx: '88%',
    hy: '82%',
    ...DEFAULT_GLOW,
    ...glow,
  };
  return (
    <section ref={sectionRef} id={id} aria-labelledby={labelledBy} className={cx(positioned && 'relative', sec && 'py-[clamp(88px,11vw,150px)]', className)} style={style}>
      {ambient && <Ambient k={k} />}
      {children}
      {grain ? (
        <Grain className="-z-[1]" />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-[1]"
          style={{
            background: `radial-gradient(42% 38% at ${g.gx} ${g.gy},${g.ga},transparent 70%),radial-gradient(36% 34% at ${g.hx} ${g.hy},${g.gb},transparent 72%)`,
          }}
        />
      )}
    </section>
  );
}

/** Section content column — sits above the ambient layers (design main>section>.wrap). */
export function SectionWrap({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <Wrap className={cx('relative z-[1]', className)} style={style}>
      {children}
    </Wrap>
  );
}
