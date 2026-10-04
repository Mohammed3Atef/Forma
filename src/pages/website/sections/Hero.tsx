import type { ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { usePublicPlan } from '../hooks/usePublicPlan';
import { cx } from '../cx';
import { Enter } from '../components/Enter';
import { FloatCard, PhoneFrame, phoneMk, PhoneStatus, PhoneTabBar, ProductBar, ProductFrame } from '../components/frames';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { GridBg, Halo } from '../components/layout';
import { Kpi, MAv, MBtn, MBub, MCard, MHi, MIc, mkClass, mlClass, meyClass, mhClass, mnumClass, MPill, MRow, msClass, mtClass, UA_P, Wave, type Tone } from '../components/mock';
import { Section, SectionWrap } from '../components/Section';
import { SiteButton } from '../components/SiteButton';
import { d1Class, eyebrowClass, leadClass, Piv, Rich } from '../components/type';
import m from '../components/motion.module.css';

const RAIL: IconName[] = ['home', 'users', 'msg', 'list', 'chart', 'money'];
const QUEUE: { av: string; name: string; note: string; tone: Tone; status: string; action: string; primary?: boolean }[] = [
  { av: 'OH', name: 'Omar Hassan', note: 'No session logged in 6 days', tone: 'bad', status: 'At risk', action: 'Message' },
  { av: 'NM', name: 'Nour Mostafa', note: 'Week 6 check-in submitted', tone: 'info', status: 'Review', action: 'Open', primary: true },
  { av: 'YS', name: 'Youssef Samir', note: 'Subscription renews in 3 days', tone: 'warn', status: 'Renewal', action: 'Renew' },
];

/** Coach dashboard window (design .dash) — the hero's main visual. */
function Dashboard() {
  return (
    <div className="grid min-h-[30em] grid-cols-[4.2em_1fr]">
      <div className="flex flex-col items-center gap-[.6em] border-e border-site-line bg-surface-raised py-[1em]">
        <img src="/website/forma-mark.webp" alt="" className="mb-[.8em] h-[2.1em] w-[2.1em]" />
        {RAIL.map((icon, i) => (
          <span key={icon} className={cx('grid h-[2.4em] w-[2.4em] place-items-center rounded-[.7em]', i === 0 ? 'bg-site-brand-tint text-brand-hover' : 'text-site-tx3')}>
            <Icon name={icon} size="1.25em" />
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-[1.2em] px-[1.8em] py-[1.6em]">
        <div>
          <p className={cx(meyClass, UA_P)}>Thursday · 2 October</p>
          <p className={mhClass} style={{ fontSize: '2em', margin: '.25em 0 .2em' }}>
            4 clients need you today.
          </p>
          <p className={cx(msClass, UA_P)}>1 missed session · 2 check-ins · 1 renewal in 3 days</p>
        </div>
        <MCard style={{ padding: 0, overflow: 'hidden' }}>
          {QUEUE.map((q, i) => (
            <MRow key={q.av} style={{ padding: '.75em 1em', borderBottom: i < QUEUE.length - 1 ? '1px solid rgba(255,238,228,.09)' : undefined }}>
              <MAv>{q.av}</MAv>
              <div className="min-w-0 flex-1">
                <p className={cx(mtClass, UA_P)}>{q.name}</p>
                <p className={cx(msClass, UA_P)}>{q.note}</p>
              </div>
              <MPill tone={q.tone}>{q.status}</MPill>
              <MBtn sec={!q.primary} style={{ height: '2.3em', padding: '0 1em' }}>
                {q.action}
              </MBtn>
            </MRow>
          ))}
        </MCard>
        <div className="grid grid-cols-4 gap-[.7em]">
          <Kpi
            label="Active clients"
            value={
              <>
                23<span style={{ fontSize: '.55em', color: '#7C726C' }}>/25</span>
              </>
            }
          />
          <Kpi label="Adherence" value="86%" delta="+4 pts" />
          <Kpi label="Check-ins due" value="5" />
          <Kpi label="Renewals · 7d" value="3" />
        </div>
        <MCard>
          <p className={cx(mlClass, UA_P)} style={{ marginBottom: '.6em' }}>
            Client adherence · 8 weeks
          </p>
          <svg viewBox="0 0 600 90" preserveAspectRatio="none" style={{ width: '100%', height: '5.5em', display: 'block', direction: 'ltr' }}>
            <path d="M0 62 L86 58 L172 60 L258 44 L344 38 L430 30 L516 24 L600 18 L600 90 L0 90Z" fill="url(#hg1)" />
            <path
              pathLength={1}
              d="M0 62 L86 58 L172 60 L258 44 L344 38 L430 30 L516 24 L600 18"
              fill="none"
              stroke="url(#hg2)"
              strokeWidth="2.6"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          </svg>
        </MCard>
      </div>
    </div>
  );
}

/** Client app "Today" screen in the hero phone. */
function TodayPhone() {
  const row = (icon: IconName, tint: string, color: string, title: string, sub: string) => (
    <MRow style={{ gap: '3cqw' }}>
      <MIc name={icon} style={{ width: '8cqw', height: '8cqw', borderRadius: '2.4cqw', background: tint, color }} iconStyle={{ width: '4cqw', height: '4cqw' }} />
      <div className="min-w-0 flex-1">
        <p className={cx(mtClass, UA_P)} style={{ fontSize: '3.4cqw' }}>
          {title}
        </p>
        <p className={cx(msClass, UA_P)} style={{ fontSize: '2.8cqw' }}>
          {sub}
        </p>
      </div>
    </MRow>
  );
  return (
    <PhoneFrame>
      <PhoneStatus />
      <div className={phoneMk} style={{ padding: '1cqw 6cqw', display: 'flex', flexDirection: 'column', gap: '3cqw', flex: 1 }}>
        <p className={cx(meyClass, UA_P)} style={{ fontSize: '2.9cqw' }}>
          Thursday · Week 9
        </p>
        <MHi style={{ padding: '4.5cqw', borderRadius: '5cqw' }}>
          <MRow style={{ gap: '4cqw', position: 'relative', zIndex: 1 }}>
            <svg viewBox="0 0 60 60" style={{ width: '19cqw', height: '19cqw', transform: 'rotate(-90deg)' }}>
              <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(255,238,228,.1)" strokeWidth="6" />
              <circle cx="30" cy="30" r="25" fill="none" stroke="url(#hg2)" strokeWidth="6" strokeLinecap="round" strokeDasharray="157" strokeDashoffset="53" />
            </svg>
            <div>
              <p className={cx(mhClass, UA_P)} style={{ fontSize: '6.2cqw' }}>
                Upper A
              </p>
              <p className={cx(msClass, UA_P)} style={{ fontSize: '3.2cqw' }}>
                6 exercises · 55 min
              </p>
            </div>
          </MRow>
          <MBtn style={{ marginTop: '3.5cqw', height: '10cqw', fontSize: '3cqw', position: 'relative', zIndex: 1 }}>Start workout</MBtn>
        </MHi>
        <MCard style={{ padding: '3cqw 4cqw', borderRadius: '4cqw', display: 'flex', flexDirection: 'column', gap: '2.6cqw' }}>
          {row('meal', 'rgba(63,178,127,.14)', '#3FB27F', 'Nutrition', '1,980 / 2,050 kcal')}
          {row('activity', 'rgba(91,141,239,.14)', '#5B8DEF', 'Zone 2 walk', '40 min')}
        </MCard>
      </div>
      <PhoneTabBar active="today" />
    </PhoneFrame>
  );
}

/** Positioned piece of the hero collage. */
function Piece({ className, children }: { className: string; children: ReactNode }) {
  return <div className={cx('absolute', className)}>{children}</div>;
}

/** Floating card's mock text root (design .fcard .mk). */
const fcardMk = cx(mkClass, 'text-[clamp(9px,4.5cqw,13px)]');

export function Hero({ k }: { k: number }) {
  const { t } = useSiteT();
  const plan = usePublicPlan();
  const trial = plan
    ? plan.trialEnabled
      ? t('pricing.card.trial', { days: plan.trialDurationDays })
      : t('pricing.card.upTo', { clients: plan.maxClients })
    : t('hero.trialFallback');
  return (
    <Section k={k} grain sec={false} labelledBy="h-hero" className="overflow-clip pb-[clamp(72px,9vw,120px)] pt-[clamp(120px,15vw,168px)]">
      <GridBg style={{ opacity: 0.7 }} />
      <Halo style={{ width: 640, height: 520, background: 'rgba(255,139,2,.22)', insetInlineEnd: -160, top: 40 }} />
      <SectionWrap className="grid items-center gap-[clamp(48px,6vw,72px)] min-[1100px]:grid-cols-[minmax(0,.86fr)_minmax(0,1.14fr)]">
        <div className="flex flex-col items-start gap-[26px]">
          <Enter d={0}>
            <p className={eyebrowClass}>{t('hero.eyebrow')}</p>
          </Enter>
          <Enter d={1}>
            <h1 id="h-hero" className={d1Class}>
              <Rich k="hero.title" components={{ l: <span className="block" />, piv: <Piv className="block" /> }} />
            </h1>
          </Enter>
          <Enter d={2}>
            <p className={leadClass}>{t('hero.lead')}</p>
          </Enter>
          <Enter d={3} className="flex flex-wrap gap-3 max-[599px]:w-full">
            <SiteButton auth="signup" arrow className="max-[599px]:flex-[1_1_100%]" testId="website-hero-cta">
              <span>{t('shell.start')}</span>
            </SiteButton>
            <SiteButton variant="secondary" to="#how" className="max-[599px]:flex-[1_1_100%]">
              {t('hero.how')}
            </SiteButton>
          </Enter>
          <Enter d={4}>
            <p className="my-[1em] flex flex-wrap items-center gap-x-[18px] gap-y-[10px] font-mono text-[12px] uppercase tracking-[.05em] text-site-tx3 rtl:font-site-ar rtl:text-[14px] rtl:normal-case rtl:tracking-normal">
              <b className="font-medium text-earth" data-plan="trial">
                {trial}
              </b>
              <i className="h-1 w-1 rounded-full bg-site-tx4" />
              <span>{t('hero.noAi')}</span>
              <i className="h-1 w-1 rounded-full bg-site-tx4" />
              <span>{t('hero.clientApp')}</span>
            </p>
          </Enter>
        </div>

        {/* LTR in both languages: the collage shows the English app, so it must not mirror over the dashboard title. */}
        <div dir="ltr" className="relative aspect-[1.16] w-full max-[1099px]:mx-auto max-[1099px]:max-w-[860px] max-[599px]:aspect-[.92]" role="img" aria-label={t('hero.visual')}>
          <div className="absolute inset-[8%_4%_0_10%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,139,2,.28),transparent_70%)] blur-[40px]" />
          <Piece className="start-0 top-[3%] w-[86%] max-[599px]:hidden">
            <Enter rise d={3}>
              <ProductFrame>
                <ProductBar url="app.useforma.fit/coach" />
                <Dashboard />
              </ProductFrame>
            </Enter>
          </Piece>
          <Piece className="bottom-0 end-0 z-[3] w-[27%] max-[599px]:bottom-auto max-[599px]:end-auto max-[599px]:start-[24%] max-[599px]:top-0 max-[599px]:w-[52%]">
            <Enter rise d={5}>
              <div className={cx(m.float, m.floatB)}>
                <TodayPhone />
              </div>
            </Enter>
          </Piece>
          <Piece className="-start-[3%] bottom-[4%] z-[4] w-[37%] max-[599px]:bottom-[2%] max-[599px]:start-0 max-[599px]:w-[58%]">
            <Enter rise d={6}>
              <div className={m.float}>
                <FloatCard>
                  <div className={fcardMk} style={{ display: 'flex', flexDirection: 'column', gap: '.8em' }}>
                    <MRow>
                      <MAv>SF</MAv>
                      <div className="min-w-0 flex-1">
                        <p className={cx(mtClass, UA_P)}>Salma Fathy</p>
                        <p className={cx(msClass, UA_P)}>Week 9 check-in · just now</p>
                      </div>
                    </MRow>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6em' }}>
                      <Kpi label="Weight" value="61.8" delta="−0.6 kg" valueStyle={{ fontSize: '1.25em' }} />
                      <Kpi label="Energy" value="Good" valueStyle={{ fontSize: '1.25em' }} />
                    </div>
                    <MBtn style={{ height: '2.6em' }}>Review check-in</MBtn>
                  </div>
                </FloatCard>
              </div>
            </Enter>
          </Piece>
          <Piece className="-top-[4%] end-[14%] z-[4] w-[33%] max-[599px]:end-0 max-[599px]:top-[14%] max-[599px]:w-[54%]">
            <Enter rise d={7}>
              <FloatCard>
                <div className={fcardMk} style={{ display: 'flex', flexDirection: 'column', gap: '.6em' }}>
                  <MRow>
                    <MAv style={{ width: '1.9em', height: '1.9em' }}>OH</MAv>
                    <p className={cx(mtClass, UA_P)} style={{ fontSize: '.9em' }}>
                      Omar Hassan
                    </p>
                    <span className={msClass} style={{ marginInlineStart: 'auto' }}>
                      2m
                    </span>
                  </MRow>
                  <MBub style={{ maxWidth: '100%' }}>Coach, can I move Thursday to Saturday?</MBub>
                  <MBub me className="flex min-w-0 items-center gap-[.7em]" style={{ maxWidth: '100%', alignSelf: 'flex-end' }}>
                    <span className="grid h-[2.2em] w-[2.2em] flex-none place-items-center rounded-full bg-[rgba(26,14,5,.18)]">
                      <Icon name="play" style={{ width: '1em' }} />
                    </span>
                    <span className="flex h-[1.8em] flex-1 items-center gap-[2px]">
                      <Wave />
                    </span>
                    <span className={mnumClass} style={{ fontSize: '.8em' }}>
                      0:14
                    </span>
                  </MBub>
                </div>
              </FloatCard>
            </Enter>
          </Piece>
        </div>
      </SectionWrap>
    </Section>
  );
}
