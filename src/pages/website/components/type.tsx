import type { CSSProperties, ReactNode } from 'react';
import { Trans } from 'react-i18next';
import { cx } from '../cx';
import { useSiteT } from '../hooks/useSiteLang';
import { Reveal } from './Reveal';

/* Website type scale (design site.css "type"). Arabic switches to the site's
   Arabic face, drops letter-case/tracking and opens up display line-height. */

/** Gold italic highlight inside headings (design .piv) — `<piv>` in the copy. */
export function Piv({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx(className, "bg-gradient-gold bg-clip-text pe-[.06em] font-normal italic text-transparent [-webkit-text-fill-color:transparent] rtl:font-bold rtl:not-italic")}>
      {children}
    </span>
  );
}

/** Copy with `<piv>…</piv>` markup → Piv (and optional extra components). */
export function Rich({ k, components }: { k: string; components?: Record<string, JSX.Element> }) {
  const { t } = useSiteT();
  return <Trans t={t} i18nKey={k} components={{ piv: <Piv />, ...components }} />;
}

export const eyebrowClass =
  "my-[1em] inline-flex items-center gap-[10px] font-mono text-[12px] font-medium uppercase tracking-[.09em] text-brand-hover before:h-[1.5px] before:w-[18px] before:rounded-[2px] before:bg-gradient-brand before:content-[''] rtl:font-site-ar rtl:normal-case rtl:tracking-normal";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx(eyebrowClass, className)}>{children}</p>;
}

const display = 'm-0 font-display font-bold [text-wrap:balance] rtl:font-site-ar rtl:leading-[1.18] rtl:tracking-normal';
export const d1Class = cx(display, 'text-[clamp(42px,6.4vw,86px)] leading-[.98] tracking-[-.04em]');
export const d2Class = cx(display, 'text-[clamp(32px,4.4vw,58px)] leading-[1.03] tracking-[-.035em]');
export const d3Class = 'm-0 font-display text-[clamp(22px,2.2vw,28px)] font-semibold leading-[1.2] tracking-[-.02em] rtl:font-site-ar rtl:leading-[1.18] rtl:tracking-normal';

export const leadClass = 'm-0 max-w-[36em] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-earth-muted [text-wrap:pretty]';

/** Mono uppercase caption (design .cap). */
export const capClass = 'font-mono text-[11px] uppercase tracking-[.06em] text-site-tx3 rtl:font-site-ar rtl:normal-case rtl:tracking-normal';

/**
 * Section heading block (design .sec-head): eyebrow, display title, optional lead.
 * `center` = design .sec-head.c. Revealed on scroll like the design.
 */
export function SecHead({
  ns,
  id,
  center,
  lead = true,
  className,
  style,
  bare,
  children,
}: {
  /** i18n prefix: `<ns>.eyebrow`, `<ns>.title`, `<ns>.lead`. */
  ns: string;
  /** Title element id (the section's aria-labelledby target). */
  id: string;
  center?: boolean;
  lead?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Extra content after the lead (chips, points…). */
  children?: ReactNode;
  /** Inside an element that already reveals — render a plain block (no own reveal). */
  bare?: boolean;
}) {
  const { t } = useSiteT();
  const cls = cx('mb-[clamp(40px,6vw,72px)] flex max-w-[760px] flex-col gap-[18px]', center && 'mx-auto items-center text-center', className);
  const body = (
    <>
      <Eyebrow>{t(`${ns}.eyebrow`)}</Eyebrow>
      <h2 id={id} className={d2Class}>
        <Rich k={`${ns}.title`} />
      </h2>
      {lead && <p className={leadClass}>{t(`${ns}.lead`)}</p>}
      {children}
    </>
  );
  return bare ? (
    <div className={cls} style={style}>
      {body}
    </div>
  ) : (
    <Reveal className={cls} style={style}>
      {body}
    </Reveal>
  );
}
