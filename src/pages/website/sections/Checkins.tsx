import type { CSSProperties, ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { MBar, MBub, MCard, mkClass, mnumClass, MPill, MRow, msClass } from '../components/mock';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { capClass, SecHead } from '../components/type';

/** The scattered "before" fragments (design .ci-scat) — English sample data. */
const SCATTER: { icon: IconName; text: string; tag: string; style: CSSProperties }[] = [
  { icon: 'msg', text: '"photos sent!"', tag: 'Chat', style: { left: '2%', top: '8%', transform: 'rotate(-4deg)' } },
  { icon: 'camera', text: 'IMG_5340.jpg', tag: 'Gallery', style: { right: '2%', top: '22%', transform: 'rotate(5deg)' } },
  { icon: 'scale', text: '61.8 kg', tag: 'Form', style: { left: '10%', top: '44%', transform: 'rotate(3deg)' } },
  { icon: 'note', text: 'shoulder??', tag: 'Notes', style: { right: '8%', top: '62%', transform: 'rotate(-6deg)' } },
  { icon: 'mic', text: 'Feedback 2:41', tag: 'Voice', style: { left: '4%', top: '80%', transform: 'rotate(-2deg)' } },
];

/*
 * In the design `.ci-step p` (13.5px, secondary colour, no margin) out-ranks the
 * mock's `.m-s`, so the captions inside these cards render at 13.5px.
 */
const stepP = 'm-0 text-[13.5px] text-earth-muted';
/** The mock caption under that rule: .m-s layout, .ci-step p size/colour. */
const stepCaption = cx(stepP, 'overflow-hidden text-ellipsis whitespace-nowrap [unicode-bidi:plaintext]');

function Step({ icon, k, dotClass, children }: { icon: IconName; k: string; dotClass?: string; children: ReactNode }) {
  const { t } = useSiteT();
  return (
    <div className="relative flex flex-col gap-3 [container-type:inline-size] min-[760px]:items-center min-[760px]:text-center">
      <span className={cx('relative z-[1] grid h-11 w-11 place-items-center rounded-full border border-site-line3 bg-surface-raised text-brand-hover', dotClass)}>
        <Icon name={icon} size={19} />
      </span>
      <h4 className="m-0 text-[15px] font-semibold">{t(`checkins.steps.${k}.h`)}</h4>
      <p className={stepP}>{t(`checkins.steps.${k}.p`)}</p>
      {children}
    </div>
  );
}

const card = cx(mkClass, 'text-[clamp(10px,6cqw,12.5px)]');

/** Weekly check-ins: scattered across apps vs one flow in Forma. */
export function Checkins({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section id="checkins" k={k} labelledBy="h-ci" style={{ paddingTop: 0 }} glow={{ gx: '10%', gy: '30%', hx: '90%', hy: '75%' }}>
      <SectionWrap>
        <SecHead ns="checkins" id="h-ci" lead={false} />
        <div className="grid gap-4 min-[1000px]:grid-cols-[minmax(0,.85fr)_minmax(0,1.6fr)]">
          <Reveal className="relative min-h-[300px] overflow-hidden rounded-[24px] border-[1.5px] border-dashed border-site-line3 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgba(255,238,228,.015)_14px_15px)] p-6">
            <p className={cx(capClass, 'my-[1em]')}>{t('checkins.without')}</p>
            <div className="relative h-[240px]" aria-hidden="true">
              {SCATTER.map((s) => (
                <span
                  key={s.tag}
                  style={s.style}
                  className="absolute inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-site-line2 bg-surface-raised px-3 py-[9px] text-[13px] text-earth-muted shadow-site-2"
                >
                  <Icon name={s.icon} style={{ width: 15 }} />
                  {s.text}
                  <small className="font-mono text-[10px] uppercase tracking-[.05em] text-site-tx4">{s.tag}</small>
                </span>
              ))}
            </div>
            <p className="m-0 text-[14px] text-earth-muted [text-wrap:pretty]">{t('checkins.withoutBody')}</p>
          </Reveal>
          <Reveal
            d={1}
            className="relative overflow-hidden rounded-[24px] border border-site-line2 bg-gradient-surface-hi p-6 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-['']"
          >
            <p className={cx(capClass, 'relative z-[1] mt-[1em]')} style={{ marginBottom: 20, color: '#FFB208' }}>
              {t('checkins.with')}
            </p>
            <div className="relative z-[1] grid gap-[14px] min-[760px]:grid-cols-4">
              <div className="absolute inset-x-[calc(12.5%-5.25px)] top-[21px] hidden h-[2px] bg-site-line2 min-[760px]:block">
                <i className="absolute inset-0 origin-left scale-x-0 bg-gradient-brand transition-transform delay-300 duration-[1800ms] ease-card group-data-[in=true]/rv:scale-x-100 motion-reduce:transition-none rtl:origin-right" />
              </div>
              <Step icon="check" k="submit">
                <MCard dir="ltr" className={card}>
                  <MBar value="100%" grow />
                  <p className={stepCaption} style={{ marginTop: '.5em' }}>
                    Step 4 of 4 · Submitted
                  </p>
                </MCard>
              </Step>
              <Step icon="chart" k="context">
                <MCard dir="ltr" className={card}>
                  <MRow>
                    <span className={cx(msClass, 'min-w-0 flex-1')}>Adherence</span>
                    <b className={mnumClass}>94%</b>
                  </MRow>
                  <MRow style={{ marginTop: '.3em' }}>
                    <span className={cx(msClass, 'min-w-0 flex-1')}>vs Week 8</span>
                    <b className={mnumClass} style={{ color: '#3FB27F' }}>
                      −0.6 kg
                    </b>
                  </MRow>
                </MCard>
              </Step>
              <Step icon="search" k="review">
                <MCard dir="ltr" className={card}>
                  <p className={stepCaption} style={{ whiteSpace: 'normal', color: '#ABA19B' }}>
                    "Bench felt easy. Slight shoulder tightness."
                  </p>
                </MCard>
              </Step>
              <Step icon="send" k="respond" dotClass="!border-transparent !bg-gradient-brand !text-brand-ink">
                <MCard dir="ltr" className={card} style={{ display: 'flex', flexDirection: 'column', gap: '.5em' }}>
                  <MBub me style={{ maxWidth: '100%', fontSize: '.85em' }}>
                    Neutral grip on incline this week.
                  </MBub>
                  <MPill tone="ok" style={{ alignSelf: 'flex-start' }}>
                    Plan updated
                  </MPill>
                </MCard>
              </Step>
            </div>
          </Reveal>
        </div>
      </SectionWrap>
    </Section>
  );
}
