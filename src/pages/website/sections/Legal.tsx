import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { buttonClass } from '../components/SiteButton';
import { Wrap } from '../components/layout';
import { SiteLink, scrollToHash } from '../nav';
import { capClass } from '../components/type';
import { LEGAL_CONTENT, LEGAL_UPDATED, type LegalBlock, type LegalDocKey } from '../legal';
import { PageHero } from './PageHero';

/**
 * The legal copy marks up only links and bold (<a href="…">, <b>). Turn those
 * into React elements — no innerHTML; any other markup renders as text.
 */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<a href="([^"]+)"([^>]*)>(.*?)<\/a>|<b>(.*?)<\/b>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[1];
      const blank = /target="_blank"/.test(m[2]);
      const ltr = /dir="ltr"/.test(m[2]);
      out.push(
        href.startsWith('/') ? (
          <SiteLink key={m.index} to={href}>
            {m[3]}
          </SiteLink>
        ) : (
          <a key={m.index} href={href} dir={ltr ? 'ltr' : undefined} target={blank ? '_blank' : undefined} rel={blank ? 'noopener' : undefined}>
            {m[3]}
          </a>
        ),
      );
    } else out.push(<b key={m.index}>{m[4]}</b>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const Html = ({ html, as: As = 'span', className }: { html: string; as?: 'span' | 'p' | 'li'; className?: string }) => <As className={className}>{rich(html)}</As>;

const linkStyles = '[&_a]:text-brand-hover [&_a]:underline [&_a]:underline-offset-[3px] [&_b]:font-semibold [&_b]:text-earth';

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <Html as="p" html={block} className={cx('mb-[14px] mt-0 text-[16.5px] leading-[1.75] text-earth-muted', linkStyles)} />;
  if ('ul' in block)
    return (
      <ul className={cx('mb-[14px] mt-0 list-disc ps-[22px] text-[16px] leading-[1.75] text-earth-muted [&>li+li]:mt-[6px]', linkStyles)}>
        {block.ul.map((item, i) => (
          <Html key={i} as="li" html={item} />
        ))}
      </ul>
    );
  const [head, ...rows] = block.table;
  return (
    <div className="mb-4 overflow-x-auto rounded-[14px] border border-site-line">
      <table className="w-full border-collapse text-[14.5px] leading-[1.55] max-[640px]:block">
        <thead className="max-[640px]:hidden">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-site-line bg-surface-card px-4 py-3 text-start font-mono text-[11px] font-medium uppercase tracking-[.08em] text-site-tx3 rtl:font-site-ar rtl:text-[13px] rtl:normal-case rtl:tracking-normal"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-[640px]:block">
          {rows.map((row, r) => (
            <tr key={r} className="max-[640px]:block [&+tr]:max-[640px]:border-t [&+tr]:max-[640px]:border-site-line">
              {row.map((cell, i) => (
                <td
                  key={i}
                  data-label={head[i]}
                  className={cx(
                    'border-t border-site-line px-4 py-3 align-top text-earth-muted [tr:first-child>&]:border-t-0',
                    // phones: each row becomes a labelled card
                    "max-[640px]:block max-[640px]:border-t-0 max-[640px]:px-4 max-[640px]:py-1 max-[640px]:first:pt-[14px] max-[640px]:last:pb-[14px]",
                    i > 0 &&
                      "max-[640px]:before:block max-[640px]:before:font-mono max-[640px]:before:text-[10.5px] max-[640px]:before:uppercase max-[640px]:before:tracking-[.08em] max-[640px]:before:text-site-tx4 max-[640px]:before:content-[attr(data-label)] rtl:max-[640px]:before:font-site-ar rtl:max-[640px]:before:text-[12px] rtl:max-[640px]:before:normal-case rtl:max-[640px]:before:tracking-normal",
                  )}
                >
                  {i === 0 ? (
                    <b dir="ltr" className="whitespace-nowrap font-semibold text-earth">
                      {cell}
                    </b>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const minutesAr = (m: number) => (m === 1 ? 'دقيقة واحدة' : m === 2 ? 'دقيقتان' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`);

/** Terms / Privacy / Cookies (design legal.js layout, real copy from legal.ts). */
export function LegalPage({ doc }: { doc: LegalDocKey }) {
  const { lang } = useSiteT();
  const ar = lang === 'ar';
  const k = ar ? 1 : 0;
  const page = LEGAL_CONTENT[doc];
  const [active, setActive] = useState<string | null>(null);
  const bodyRef = useRef<HTMLElement>(null);

  // Highlight the section in view in the contents list.
  useEffect(() => {
    const secs = bodyRef.current?.querySelectorAll('section[id]');
    if (!secs) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [doc, lang]);

  const words = page.s
    .flatMap((s) => s.b[k])
    .map((b) => (typeof b === 'string' ? b : 'ul' in b ? b.ul.join(' ') : b.table.flat().join(' ')))
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / (ar ? 150 : 200)));

  return (
    <>
      <PageHero eyebrow={ar ? 'قانوني' : 'Legal'} title={page.t[k]} titleSize="clamp(38px,5.4vw,64px)" grain ambient={false}>
        <div className="flex flex-wrap gap-x-[22px] gap-y-2 font-mono text-[12px] uppercase tracking-[.05em] text-site-tx3 rtl:font-site-ar rtl:text-[14px] rtl:normal-case rtl:tracking-normal">
          <span>
            {ar ? 'آخر تحديث: ' : 'Last updated · '}
            {LEGAL_UPDATED[k]}
          </span>
          <span>{ar ? `وقت القراءة: ${minutesAr(mins)}` : `Reading time · ${mins} min`}</span>
        </div>
      </PageHero>
      <Wrap className="grid gap-10 pb-[clamp(90px,10vw,140px)] min-[1000px]:grid-cols-[240px_minmax(0,1fr)] min-[1000px]:gap-[72px]">
        <nav
          aria-label={ar ? 'المحتويات' : 'Contents'}
          className="flex flex-col gap-[2px] max-[999px]:rounded-2xl max-[999px]:border max-[999px]:border-site-line max-[999px]:bg-surface-card max-[999px]:p-4 min-[1000px]:sticky min-[1000px]:top-[100px] min-[1000px]:self-start"
        >
          <p className={cx(capClass, 'mb-[10px] mt-0')}>{ar ? 'المحتويات' : 'Contents'}</p>
          {page.s.map((s, i) => {
            const id = `s${i + 1}`;
            return (
              <a
                key={id}
                href={`#${id}`}
                data-toc={id}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToHash(`#${id}`);
                }}
                className={cx(
                  'flex gap-[10px] rounded-[10px] border-s-2 px-[10px] py-2 text-[14px] no-underline hover:bg-[rgba(255,238,228,.04)] hover:text-earth',
                  active === id ? 'on border-brand bg-[rgba(255,139,2,.06)] text-earth' : 'border-transparent text-earth-muted',
                )}
              >
                <span className="pt-[2px] font-mono text-[11px] text-site-tx4">{String(i + 1).padStart(2, '0')}</span>
                {s.h[k]}
              </a>
            );
          })}
        </nav>
        <article ref={bodyRef} className="min-w-0 max-w-[720px]">
          {page.s.map((s, i) => {
            const id = `s${i + 1}`;
            return (
              <section key={id} id={id} className="mb-10 scroll-mt-[100px] border-b border-site-line pb-10">
                <h2 className="mb-[14px] mt-0 flex items-baseline gap-[14px] text-[clamp(21px,2vw,25px)] font-semibold tracking-[-.02em]">
                  <a
                    href={`#${id}`}
                    aria-label="Link to section"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToHash(`#${id}`);
                    }}
                    className="font-mono text-[13px] font-medium text-site-tx4 no-underline hover:text-brand-hover"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </a>
                  {s.h[k]}
                </h2>
                {s.b[k].map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </section>
            );
          })}
          <section className="mb-10 scroll-mt-[100px] pb-10">
            <h2 className="mb-[14px] mt-0 flex items-baseline gap-[14px] text-[clamp(21px,2vw,25px)] font-semibold tracking-[-.02em]">{ar ? 'أسئلة؟' : 'Questions?'}</h2>
            <p className="mb-[14px] mt-0 text-[16.5px] leading-[1.75] text-earth-muted">{ar ? 'لو عندك أي سؤال عن الصفحة دي، تواصل معانا.' : 'If anything on this page is unclear, get in touch.'}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={buttonClass('secondary', true)}>
                {SUPPORT_EMAIL}
              </a>
              <SiteLink to="/contact" className={buttonClass('ghost', true)}>
                {ar ? 'صفحة التواصل' : 'Contact page'}
              </SiteLink>
            </div>
          </section>
        </article>
      </Wrap>
    </>
  );
}
