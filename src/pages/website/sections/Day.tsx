import type { ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { MAv, MCard, mkClass, MNum, MPill, MRow, MS, Voice } from '../components/mock';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { SecHead } from '../components/type';

/**
 * "A day with Forma" — five moments on a timeline. Horizontal with a drawn
 * line from 1000px; below that a vertical rail on the inline-start side, with
 * the times aligned to the rail in both directions.
 */
function Step({ time, label, children }: { time: string; label: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'relative flex flex-col gap-3 rounded-[18px] border border-site-line bg-surface-card p-[18px] [container-type:inline-size]',
        // timeline dot: on the rail (mobile) / on the line above the card (desktop)
        "before:absolute before:h-3 before:w-3 before:rounded-full before:border-2 before:border-brand before:bg-surface before:content-['']",
        'max-[999px]:before:-start-[26px] max-[999px]:before:top-[6px]',
        'min-[1000px]:before:-top-[41px] min-[1000px]:before:start-[calc(50%-6px)] min-[1000px]:before:shadow-[0_0_0_5px_rgba(255,139,2,.12)]',
      )}
    >
      <time dir="ltr" className="font-mono text-[24px] tracking-[-.02em] text-earth max-[999px]:rtl:text-right min-[1000px]:text-center">
        {time}
      </time>
      <h4 className="m-0 text-[15px] font-semibold min-[1000px]:text-center">{label}</h4>
      <MCard dir="ltr" className={cx(mkClass, 'text-[clamp(10px,5.6cqw,12.5px)]')}>{children}</MCard>
    </div>
  );
}

export function Day({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section
      id="day"
      k={k}
      labelledBy="h-day"
      style={{ paddingTop: 'clamp(40px,6vw,80px)' }}
      glow={{ gx: '50%', gy: '10%', hx: '50%', hy: '95%', ga: 'rgba(255,139,2,.12)' }}
    >
      <SectionWrap>
        <SecHead ns="day" id="h-day" center lead={false} />
        <Reveal
          className={cx(
            'relative grid gap-[14px] min-[1000px]:grid-cols-5 min-[1000px]:gap-4 min-[1000px]:pt-[52px]',
            // mobile rail
            "max-[999px]:ps-[26px] max-[999px]:before:absolute max-[999px]:before:bottom-2 max-[999px]:before:start-[6px] max-[999px]:before:top-2 max-[999px]:before:w-[2px] max-[999px]:before:bg-[linear-gradient(#FF8B02,rgba(255,238,228,.14))] max-[999px]:before:content-['']",
          )}
        >
          {/* desktop line, drawn in when the timeline enters the viewport */}
          <div className="absolute inset-x-[calc((100%-64px)/10)] top-[17px] hidden h-[2px] bg-site-line2 min-[1000px]:block">
            <i className="absolute inset-0 origin-left scale-x-0 bg-gradient-brand transition-transform delay-200 duration-[2400ms] ease-card group-data-[in=true]/rv:scale-x-100 motion-reduce:transition-none rtl:origin-right" />
          </div>
          <Step time="08:00" label={t('day.steps.s1')}>
            <MRow>
              <MPill tone="bad">4</MPill>
              <MS>clients need you</MS>
            </MRow>
          </Step>
          <Step time="10:30" label={t('day.steps.s2')}>
            <MRow>
              <MAv style={{ width: '1.9em', height: '1.9em' }}>NM</MAv>
              <MS>Nour · week 6</MS>
            </MRow>
          </Step>
          <Step time="13:00" label={t('day.steps.s3')}>
            <MRow>
              <MS grow>Lower B</MS>
              <MPill tone="brand" dot={false}>
                +1 set
              </MPill>
            </MRow>
          </Step>
          <Step time="16:00" label={t('day.steps.s4')}>
            <Voice className="!min-w-0 text-brand-hover" playStyle={{ background: 'rgba(255,139,2,.13)', width: '1.9em', height: '1.9em' }} iconWidth=".8em" />
          </Step>
          <Step time="19:00" label={t('day.steps.s5')}>
            <MRow>
              <MNum style={{ fontSize: '1.3em' }}>14</MNum>
              <MS>sessions logged</MS>
            </MRow>
          </Step>
        </Reveal>
      </SectionWrap>
    </Section>
  );
}
