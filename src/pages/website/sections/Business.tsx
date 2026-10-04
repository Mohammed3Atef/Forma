import { useSiteT } from '../hooks/useSiteLang';
import { useCountUp } from '../hooks/useCountUp';
import { cx } from '../cx';
import { ProductFrame } from '../components/frames';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { Kpi, MAv, MCard, meyClass, mhClass, mlClass, MPill, MRow, msClass, mtClass, UA_P } from '../components/mock';
import { Reveal, useRevealed } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { SecHead } from '../components/type';

const POINTS: [IconName, string][] = [
  ['money', 'revenue'],
  ['calendar', 'renewals'],
  ['activity', 'adherence'],
  ['chart', 'reports'],
];
const BARS = [52, 58, 63, 71, 84, 92];

function Count({ to }: { to: number }) {
  return <>{useCountUp(to, useRevealed())}</>;
}

/** Business dashboard mock (design .bizd) — numbers count up and bars grow on reveal. */
function BusinessBoard() {
  return (
    <div className="flex flex-col gap-[1.1em] p-[1.6em]">
      <MRow>
        <div className="min-w-0 flex-1">
          <p className={cx(meyClass, UA_P)}>October</p>
          <p className={cx(mhClass, UA_P)} style={{ fontSize: '1.8em', marginTop: '.2em' }}>
            Business
          </p>
        </div>
        <MPill tone="mute" dot={false}>
          30 days
        </MPill>
      </MRow>
      <div className="grid grid-cols-4 gap-[.7em]">
        <Kpi
          label="Revenue"
          value={
            <>
              EGP <Count to={41400} />
            </>
          }
          delta="+8%"
        />
        <Kpi label="Active subs" value={<Count to={23} />} />
        <Kpi label="Renewals · 14d" value={<Count to={6} />} />
        <Kpi
          label="Adherence"
          value={
            <>
              <Count to={86} />%
            </>
          }
        />
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-[1em]">
        <MCard>
          <p className={cx(mlClass, UA_P)} style={{ marginBottom: '.8em' }}>
            Revenue · 6 months
          </p>
          <div className="flex h-[9em] items-end gap-[.55em]" style={{ direction: 'ltr' }}>
            {BARS.map((h, i) => (
              <i
                key={h}
                className={cx(
                  'flex-1 origin-bottom scale-y-0 rounded-[.4em_.4em_.15em_.15em] transition-transform duration-1000 ease-card [transition-delay:calc(var(--k,0)*50ms)] group-data-[in=true]/rv:scale-y-100 motion-reduce:scale-y-100 motion-reduce:transition-none',
                  i === BARS.length - 1 ? 'bg-gradient-brand' : 'bg-surface-strong',
                )}
                style={{ height: `${h}%`, ['--k' as string]: i }}
              />
            ))}
          </div>
          <div className={mlClass} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.5em', direction: 'ltr' }}>
            <span>May</span>
            <span>Oct</span>
          </div>
        </MCard>
        <MCard style={{ display: 'flex', flexDirection: 'column', gap: '.7em' }}>
          <p className={cx(mlClass, UA_P)}>Subscriptions</p>
          <div style={{ display: 'flex', height: '.7em', borderRadius: 99, overflow: 'hidden', gap: 2, direction: 'ltr' }}>
            <i style={{ flex: 18, background: '#3FB27F' }} />
            <i style={{ flex: 2, background: '#5B8DEF' }} />
            <i style={{ flex: 3, background: '#F5A623' }} />
          </div>
          <MRow>
            <MPill tone="ok">Active 18</MPill>
          </MRow>
          <MRow>
            <MPill tone="info">Trial 2</MPill>
          </MRow>
          <MRow>
            <MPill tone="warn">Expiring 3</MPill>
          </MRow>
        </MCard>
      </div>
      <MCard style={{ padding: 0, overflow: 'hidden' }}>
        <p className={cx(mlClass, UA_P)} style={{ padding: '.9em 1em .4em' }}>
          Upcoming renewals
        </p>
        {[
          ['YS', 'Youssef Samir', '3 days · 88% adherence', 'ok', 'Likely'],
          ['OH', 'Omar Hassan', '5 days · 44% adherence', 'bad', 'At risk'],
        ].map(([av, name, note, tone, status]) => (
          <MRow key={av} style={{ padding: '.6em 1em', borderTop: '1px solid rgba(255,238,228,.09)' }}>
            <MAv>{av}</MAv>
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)}>{name}</p>
              <p className={cx(msClass, UA_P)}>{note}</p>
            </div>
            <MPill tone={tone as 'ok' | 'bad'}>{status}</MPill>
          </MRow>
        ))}
      </MCard>
      <p className={cx(mlClass, UA_P)} style={{ textAlign: 'end', color: '#564E49' }}>
        Illustrative data
      </p>
    </div>
  );
}

/** "Your business" — coaching and business health side by side. */
export function Business({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section id="business" k={k} labelledBy="h-biz" glow={{ gx: '12%', gy: '70%', hx: '85%', hy: '15%' }}>
      <SectionWrap className="grid items-center gap-[clamp(32px,5vw,64px)] min-[1000px]:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
        <Reveal>
          <SecHead ns="business" id="h-biz" className="!mb-0" bare />
          <div className="mt-[22px] flex flex-col gap-[2px]">
            {POINTS.map(([icon, key]) => (
              <div key={key} className="flex gap-[14px] border-b border-site-line py-[14px] last:border-b-0">
                <Icon name={icon} className="mt-[3px] text-brand-hover" />
                <p className="m-0">
                  <b className="block text-[15px] font-semibold">{t(`business.points.${key}.b`)}</b>
                  <span className="text-[14px] text-earth-muted">{t(`business.points.${key}.s`)}</span>
                </p>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal variant="scale" d={1}>
          <ProductFrame>
            <BusinessBoard />
          </ProductFrame>
        </Reveal>
      </SectionWrap>
    </Section>
  );
}
