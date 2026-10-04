import type { CSSProperties, ReactNode, Ref } from 'react';
import { cx } from '../cx';
import { d3Class } from './type';

/**
 * Step-story layout (design .story / .stage / .steps / .step / .dots).
 * ≥900px: copy column + sticky stage; below: stage first, steps become a
 * snap-scrolling row with dots under the stage.
 */
export function StoryGrid({ phone, children }: { phone?: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        'relative grid gap-8 min-[900px]:gap-[clamp(40px,6vw,96px)]',
        phone ? 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'min-[900px]:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]',
      )}
    >
      {children}
    </div>
  );
}

/** Sticky stage; `sh` = half the stage height used to centre it in the viewport (design --sh). */
export function Stage({ sh, children }: { sh: string; children: ReactNode }) {
  return (
    <div
      className="relative min-[900px]:sticky min-[900px]:order-2 min-[900px]:self-start min-[900px]:top-[max(96px,calc(50vh-var(--sh,300px)))]"
      style={{ '--sh': sh } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function Steps({ rowRef, children }: { rowRef: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div
      ref={rowRef}
      className={cx(
        'flex flex-col min-[900px]:order-1',
        'max-[899px]:-mx-[clamp(20px,5vw,40px)] max-[899px]:snap-x max-[899px]:snap-mandatory max-[899px]:flex-row max-[899px]:gap-3 max-[899px]:overflow-x-auto max-[899px]:px-[clamp(20px,5vw,40px)] max-[899px]:pb-[6px] max-[899px]:[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {children}
    </div>
  );
}

/** One step of copy: number, title, body, optional extra (tags / flow). */
export function Step({
  stepKey,
  on,
  stepRef,
  n,
  title,
  body,
  children,
}: {
  stepKey: string;
  on: boolean;
  stepRef: Ref<HTMLDivElement>;
  n: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div
      ref={stepRef}
      data-step={stepKey}
      className={cx(
        'flex min-h-[78vh] flex-col justify-center gap-[14px] py-6 transition-opacity duration-500 ease-card',
        'min-[900px]:first:min-h-[60vh] min-[900px]:last:min-h-[70vh]',
        'max-[899px]:min-h-0 max-[899px]:flex-[0_0_84%] max-[899px]:snap-start max-[899px]:rounded-[18px] max-[899px]:border max-[899px]:p-[22px] max-[899px]:opacity-100',
        on
          ? 'opacity-100 max-[899px]:border-[rgba(255,139,2,.35)] max-[899px]:bg-[linear-gradient(160deg,rgba(255,139,2,.06),#141110_50%)]'
          : 'opacity-[.32] max-[899px]:border-site-line max-[899px]:bg-surface-card',
      )}
    >
      <span className="font-mono text-[12px] tracking-[.08em] text-brand-hover">{n}</span>
      <h3 className={cx(d3Class, 'max-[899px]:!text-[21px]')}>{title}</h3>
      <p className="m-0 text-earth-muted [text-wrap:pretty]">{body}</p>
      {children}
    </div>
  );
}

/** Mobile step dots (hidden on desktop). */
export function Dots<K extends string>({ items, active, onGo }: { items: { key: K; label: string }[]; active: K; onGo: (k: K) => void }) {
  return (
    <div className="mt-[14px] flex justify-center gap-[6px] min-[900px]:hidden">
      {items.map((d) => (
        <button
          key={d.key}
          type="button"
          aria-label={d.label}
          aria-selected={d.key === active}
          onClick={() => onGo(d.key)}
          className={cx(
            'h-2 cursor-pointer rounded-full border-0 p-0 transition-[width,background] duration-300 ease-card',
            d.key === active ? 'w-[22px] bg-brand' : 'w-2 bg-surface-strong',
          )}
        />
      ))}
    </div>
  );
}

/** Mono tag chips under a step (design .step-tags). */
export function StepTags({ tags }: { tags: string[] }) {
  return (
    <div className="mt-[6px] flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-site-line2 px-3 py-[6px] font-mono text-[11px] uppercase tracking-[.05em] text-earth-muted rtl:font-site-ar rtl:text-[13px] rtl:normal-case rtl:tracking-normal"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/**
 * A stage panel (design [data-panel]): cross-fades in when active. Panels are
 * stacked in one grid cell so the stage always fits the tallest one; `abs`
 * fills a fixed-size screen instead (the phone).
 */
export function Panel({ on, abs, className, style, children }: { on: boolean; abs?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      aria-hidden={!on}
      className={cx(
        abs ? 'absolute inset-0' : '[grid-area:1/1]',
        '[transition:opacity_.55s_cubic-bezier(.16,1,.3,1),transform_.65s_cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none',
        on ? 'pointer-events-auto transform-none opacity-100' : 'pointer-events-none translate-y-[14px] opacity-0',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
