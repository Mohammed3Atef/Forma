import type { CSSProperties, ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { useStepStory } from '../hooks/useStepStory';
import { cx } from '../cx';
import { PhoneFrame, phoneMk, PhoneStatus, PhoneTabBar, type PhoneTab } from '../components/frames';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { Halo } from '../components/layout';
import { MAv, MBar, MBtn, MBub, MCard, MHi, MIc, meyClass, mlClass, mnumClass, MPill, MRow, msClass, mtClass, UA_P, Wave } from '../components/mock';
import { Section, SectionWrap } from '../components/Section';
import { Dots, Panel, Stage, Step, Steps, StoryGrid } from '../components/StepStory';
import { SecHead } from '../components/type';
import a from './app.module.css';

const KEYS = ['today', 'train', 'fuel', 'progress', 'inbox'] as const;
type Key = (typeof KEYS)[number];

const OK = '#3FB27F';
const OK_T = 'rgba(63,178,127,.14)';
const TX = '#F8F4F1';
const TX2 = '#ABA19B';
const TX3 = '#7C726C';
const S2 = '#1B1714';
const ON_BRAND = '#1A0E05';
const BRAND_SOFT = 'linear-gradient(135deg,rgba(255,178,8,.16),rgba(255,76,1,.06))';

/** Card inside the phone (design .ps .m-card: 4.4cqw radius/padding unless overridden). */
const PCard = ({ style, children }: { style?: CSSProperties; children: ReactNode }) => <MCard style={{ borderRadius: '4.4cqw', padding: '4.4cqw', ...style }}>{children}</MCard>;
/** Big phone heading (design .p-h). */
const pH = 'm-0 text-[7cqw] font-bold leading-[1.08] tracking-[-.03em]';
const fs = (size: string, extra?: CSSProperties): CSSProperties => ({ fontSize: size, ...extra });

/** Round done/undone tick used in lists. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className="grid h-[6cqw] w-[6cqw] flex-none place-items-center rounded-full"
      style={done ? { background: OK, color: '#06210f' } : { border: '1.5px solid rgba(255,238,228,.14)', color: 'transparent' }}
    >
      <Icon name="check" style={{ width: '3.4cqw' }} />
    </span>
  );
}

function TodayScreen() {
  const days: [string, number, 0 | 1 | 2][] = [
    ['M', 29, 1],
    ['T', 30, 1],
    ['W', 1, 1],
    ['T', 2, 2],
    ['F', 3, 0],
    ['S', 4, 0],
    ['S', 5, 0],
  ];
  const tasks: [IconName, string, string, string, string, boolean][] = [
    ['meal', OK_T, OK, 'Nutrition', '1,980 / 2,050 kcal', true],
    ['dumbbell', 'rgba(255,139,2,.13)', '#FFB208', 'Upper A', '21 sets · not started', false],
    ['activity', 'rgba(91,141,239,.14)', '#5B8DEF', 'Zone 2 walk', '40 min', false],
  ];
  return (
    <>
      <p className={cx(meyClass, UA_P)} style={fs('2.9cqw')}>
        Thursday · Week 9 of 12
      </p>
      <div style={{ display: 'flex', gap: '1.6cqw' }}>
        {days.map(([d, n, s], i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: '1.6cqw 0',
              borderRadius: '2.6cqw',
              textAlign: 'center',
              background: s === 2 ? 'linear-gradient(135deg,#FFB208 0%,#FF8B02 48%,#FF4C01 100%)' : '#141110',
              border: `1px solid ${s === 2 ? 'transparent' : s === 1 ? 'rgba(63,178,127,.34)' : 'rgba(255,238,228,.09)'}`,
            }}
          >
            <p className={cx(mlClass, UA_P)} style={fs('2.2cqw', { color: s === 2 ? ON_BRAND : TX3 })}>
              {d}
            </p>
            <p className={cx(mnumClass, UA_P)} style={fs('3.4cqw', { color: s === 2 ? ON_BRAND : s === 1 ? OK : TX2 })}>
              {n}
            </p>
          </div>
        ))}
      </div>
      <MHi style={{ padding: '5cqw', borderRadius: '5cqw' }}>
        <MRow style={{ gap: '4cqw', position: 'relative', zIndex: 1 }}>
          <svg viewBox="0 0 60 60" style={{ width: '22cqw', height: '22cqw', transform: 'rotate(-90deg)' }}>
            <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(255,238,228,.1)" strokeWidth="6" />
            <circle cx="30" cy="30" r="25" fill="none" stroke="url(#hg2)" strokeWidth="6" strokeLinecap="round" strokeDasharray="157" strokeDashoffset="105" />
          </svg>
          <div>
            <p className={cx(mlClass, UA_P)} style={fs('2.6cqw')}>
              1 of 3 done
            </p>
            <p className={pH} style={{ marginTop: '1cqw' }}>
              Upper A
            </p>
            <p className={cx(msClass, UA_P)} style={fs('3.1cqw')}>
              21 sets · ~55 min
            </p>
          </div>
        </MRow>
        <MBtn style={{ height: '10.5cqw', fontSize: '3cqw', marginTop: '4cqw', position: 'relative', zIndex: 1 }}>Start workout</MBtn>
      </MHi>
      <PCard style={{ display: 'flex', flexDirection: 'column', gap: '3cqw' }}>
        <p className={cx(mlClass, UA_P)} style={fs('2.6cqw')}>
          Today's plan
        </p>
        {tasks.map(([icon, tint, color, title, sub, done]) => (
          <MRow key={title} style={{ gap: '3cqw' }}>
            <Tick done={done} />
            <MIc name={icon} style={{ width: '8cqw', height: '8cqw', borderRadius: '2.4cqw', background: tint, color }} iconStyle={{ width: '4cqw' }} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={fs('3.4cqw', done ? { textDecoration: 'line-through', color: TX3 } : undefined)}>
                {title}
              </p>
              <p className={cx(msClass, UA_P)} style={fs('2.8cqw')}>
                {sub}
              </p>
            </div>
          </MRow>
        ))}
      </PCard>
      <PCard style={{ background: BRAND_SOFT, borderColor: 'rgba(255,139,2,.3)' }}>
        <MRow style={{ gap: '3cqw' }}>
          <MAv style={{ width: '8cqw', height: '8cqw', fontSize: '2.6cqw' }}>KA</MAv>
          <p className={cx(msClass, UA_P)} style={fs('3.1cqw', { whiteSpace: 'normal', color: TX })}>
            Keep 80kg on bench and add a rep. Great week.
          </p>
        </MRow>
      </PCard>
    </>
  );
}

function TrainScreen({ live }: { live: boolean }) {
  const sets: [number, string, string, 'done' | 'tick' | 'todo'][] = [
    [1, '80', '9', 'done'],
    [2, '80', '8', 'done'],
    [3, '80', '8', 'tick'],
    [4, '70', '8', 'todo'],
  ];
  const setg = 'grid grid-cols-[7cqw_1fr_1fr_10cqw] items-center gap-[2.4cqw]';
  const cell = 'grid h-[10.4cqw] place-items-center rounded-[2.8cqw] border font-mono text-[4.2cqw] shadow-[0_1px_2px_rgba(0,0,0,.4)]';
  return (
    <>
      <MRow>
        <p className={cx(meyClass, UA_P, 'min-w-0 flex-1')} style={fs('2.9cqw')}>
          Upper A · 18:42
        </p>
        <MPill tone="mute" dot={false} style={fs('2.5cqw')}>
          Finish
        </MPill>
      </MRow>
      <MBar value="38%" style={{ height: '1.4cqw' }} fillStyle={{ transform: 'none' }} />
      <div className="relative grid aspect-video place-items-center rounded-[4cqw] bg-[linear-gradient(150deg,#3a2c1e,#241a12_60%,#140d08)]">
        <span className="grid h-[12cqw] w-[12cqw] place-items-center rounded-full border-[1.5px] border-[rgba(255,255,255,.6)] text-white">
          <Icon name="play" style={{ width: '5cqw' }} />
        </span>
        <span className={cx(mlClass, 'absolute bottom-[2.4cqw] start-[3cqw]')} style={fs('2.4cqw', { color: '#ddd' })}>
          Video + cues
        </span>
      </div>
      <div>
        <p className={pH} style={fs('6cqw')}>
          Bench press
        </p>
        <p className={cx(msClass, UA_P)} style={fs('3cqw')}>
          Last time · 80kg × 8 · target +1 rep
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4cqw' }}>
        <div className={setg}>
          <span className={mlClass} style={fs('2.4cqw')}>
            #
          </span>
          <span className={mlClass} style={fs('2.4cqw', { textAlign: 'center' })}>
            kg
          </span>
          <span className={mlClass} style={fs('2.4cqw', { textAlign: 'center' })}>
            Reps
          </span>
          <span />
        </div>
        {sets.map(([n, kg, reps, state]) => {
          const done = state === 'done';
          const ticking = state === 'tick' && live;
          const cellCls = cx(cell, done ? 'border-[rgba(63,178,127,.32)] bg-site-ok-tint' : 'border-site-line2 bg-surface-raised', ticking && a.tickC);
          return (
            <div key={n} className={setg}>
              <span className={mnumClass} style={fs('3.2cqw', { color: done ? OK : TX3 })}>
                {n}
              </span>
              <span className={cellCls}>{kg}</span>
              <span className={cellCls}>{reps}</span>
              <span
                className={cx(
                  'grid h-[10cqw] w-[10cqw] place-items-center rounded-[2.8cqw] border-[1.5px]',
                  done ? 'border-success bg-success text-[#06210f]' : 'border-site-line2 text-site-tx4',
                  ticking && a.tick,
                )}
              >
                <Icon name="check" size="4.6cqw" />
              </span>
            </div>
          );
        })}
      </div>
      <PCard style={{ padding: '3cqw 4cqw' }}>
        <MRow>
          <Icon name="timer" style={{ color: '#FF8B02', width: '4.4cqw' }} />
          <span className={cx(mlClass, 'min-w-0 flex-1')} style={fs('2.6cqw')}>
            Rest
          </span>
          <span className={mnumClass} style={fs('4.4cqw')}>
            1:24
          </span>
        </MRow>
      </PCard>
    </>
  );
}

function FuelScreen() {
  const macros: [string, number, number, string][] = [
    ['Protein', 134, 158, '#FF8B02'],
    ['Carbs', 147, 195, '#8B7CF0'],
    ['Fat', 40, 66, '#2FB8B0'],
  ];
  const meals: [string, string, number, boolean][] = [
    ['Breakfast', 'Oats · Whey', 512, true],
    ['Lunch', 'Chicken · Rice', 640, true],
    ['Snack', 'Yogurt · Almonds', 288, true],
    ['Dinner', 'Salmon · Potato', 610, false],
  ];
  return (
    <>
      <p className={cx(meyClass, UA_P)} style={fs('2.9cqw')}>
        Remaining today
      </p>
      <p className={cx(mnumClass, UA_P)} style={fs('9cqw', { lineHeight: 1 })}>
        612<span style={{ fontSize: '3.6cqw', color: TX3 }}> kcal</span>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2cqw' }}>
        {macros.map(([label, v, target, color]) => (
          <PCard key={label} style={{ padding: '2.6cqw' }}>
            <p className={cx(mlClass, UA_P)} style={fs('2.2cqw')}>
              {label}
            </p>
            <p className={mnumClass} style={fs('3.8cqw', { margin: '.8cqw 0' })}>
              {v}
              <span style={{ fontSize: '2.6cqw', color: TX3 }}>/{target}</span>
            </p>
            <MBar value={`${(v / target) * 100}%`} style={{ height: '1cqw' }} fillStyle={{ background: color, transform: 'none' }} />
          </PCard>
        ))}
      </div>
      <PCard style={{ padding: 0, overflow: 'hidden' }}>
        {meals.map(([name, food, kcal, done]) => (
          <MRow key={name} style={{ gap: '3cqw', padding: '2.8cqw 4cqw', borderBottom: '1px solid rgba(255,238,228,.09)', ...(done ? {} : { background: BRAND_SOFT }) }}>
            <Tick done={done} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={fs('3.4cqw')}>
                {name}
              </p>
              <p className={cx(msClass, UA_P)} style={fs('2.7cqw')}>
                {food}
              </p>
            </div>
            <span className={mnumClass} style={fs('2.8cqw', { color: done ? TX3 : '#FFB208' })}>
              {kcal}
            </span>
          </MRow>
        ))}
      </PCard>
      <PCard>
        <MRow style={{ gap: '3cqw' }}>
          <MIc name="refresh" style={{ width: '8cqw', height: '8cqw', borderRadius: '2.4cqw', background: S2, color: '#FFB208' }} iconStyle={{ width: '4cqw' }} />
          <div className="min-w-0 flex-1">
            <p className={cx(mtClass, UA_P)} style={fs('3.4cqw')}>
              Swap a food
            </p>
            <p className={cx(msClass, UA_P)} style={fs('2.8cqw')}>
              Only coach-approved options
            </p>
          </div>
        </MRow>
      </PCard>
    </>
  );
}

function ProgressScreen() {
  return (
    <>
      <div style={{ display: 'flex', gap: '1.6cqw' }}>
        {['Weight', 'Strength', 'Measure', 'Photos'].map((label, i) => (
          <MPill key={label} tone={i === 0 ? 'brand' : 'mute'} dot={false} style={fs('2.5cqw')}>
            {label}
          </MPill>
        ))}
      </div>
      <MHi style={{ padding: '5cqw', borderRadius: '5cqw' }}>
        <p className={cx(meyClass, UA_P)} style={fs('2.7cqw', { position: 'relative', zIndex: 1 })}>
          Down 2.8kg in 12 weeks
        </p>
        <p className={msClass} style={fs('3.2cqw', { whiteSpace: 'normal', color: TX, margin: '1.5cqw 0 3cqw', position: 'relative', zIndex: 1 })}>
          Steady at 0.25kg/week — right in your coach's range.
        </p>
        <svg
          viewBox="0 0 300 100"
          preserveAspectRatio="none"
          style={{ display: 'inline', verticalAlign: 'baseline', width: '100%', height: '24cqw', position: 'relative', zIndex: 1, direction: 'ltr' }}
        >
          <path d="M0 14 L30 18 L60 22 L90 30 L120 34 L150 44 L180 50 L210 58 L240 64 L270 70 L300 76 L300 100 L0 100Z" fill="url(#hg1)" />
          <path d="M0 14 L30 18 L60 22 L90 30 L120 34 L150 44 L180 50 L210 58 L240 64 L270 70 L300 76" fill="none" stroke="url(#hg2)" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </MHi>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.4cqw' }}>
        <PCard style={{ padding: '3.5cqw' }}>
          <p className={cx(mlClass, UA_P)} style={fs('2.4cqw')}>
            Current
          </p>
          <p className={cx(mnumClass, UA_P)} style={fs('6cqw')}>
            61.8
          </p>
        </PCard>
        <PCard style={{ padding: '3.5cqw' }}>
          <p className={cx(mlClass, UA_P)} style={fs('2.4cqw')}>
            Bench PR
          </p>
          <p className={cx(mnumClass, UA_P)} style={fs('6cqw')}>
            102<span style={{ fontSize: '3cqw', color: TX3 }}>kg</span>
          </p>
        </PCard>
      </div>
    </>
  );
}

function InboxScreen() {
  return (
    <>
      <MRow style={{ gap: '3cqw' }}>
        <MAv style={{ width: '10cqw', height: '10cqw', fontSize: '3cqw' }}>KA</MAv>
        <div className="min-w-0 flex-1">
          <p className={cx(mtClass, UA_P)} style={fs('3.6cqw')}>
            Coach Karim
          </p>
          <p className={cx(msClass, UA_P)} style={fs('2.7cqw', { color: OK })}>
            ● Active now
          </p>
        </div>
      </MRow>
      <div style={{ display: 'flex', gap: '1cqw', padding: '1cqw', borderRadius: 99, background: S2 }}>
        <MPill tone="brand" dot={false} style={fs('2.4cqw', { flex: 1, justifyContent: 'center', background: '#2E2621', color: TX })}>
          Messages
        </MPill>
        <MPill tone="none" dot={false} style={fs('2.4cqw', { flex: 1, justifyContent: 'center', color: TX3 })}>
          Notes
        </MPill>
        <MPill tone="none" dot={false} style={fs('2.4cqw', { flex: 1, justifyContent: 'center', color: TX3 })}>
          Check-ins
        </MPill>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4cqw', fontSize: '3.2cqw', flex: 1, justifyContent: 'flex-end' }}>
        <MBub>Should I go up on bench today?</MBub>
        <MBub me>Keep 80kg and add a rep. We'll add load next week.</MBub>
        <MBub className="flex min-w-0 items-center gap-[.7em]" style={{ color: TX }}>
          <span className="grid h-[2.2em] w-[2.2em] flex-none place-items-center rounded-full" style={{ background: 'rgba(255,238,228,.1)' }}>
            <Icon name="play" style={{ width: '3cqw' }} />
          </span>
          <span className="flex h-[1.8em] flex-1 items-center gap-[2px]">
            <Wave />
          </span>
          <span className={mnumClass} style={fs('2.6cqw')}>
            0:18
          </span>
        </MBub>
        <p className={cx(mlClass, UA_P)} style={fs('2.3cqw', { textAlign: 'end' })}>
          Seen 19:42
        </p>
      </div>
      <MRow style={{ gap: '2cqw' }}>
        <div
          style={{
            flex: 1,
            height: '10cqw',
            borderRadius: 99,
            background: S2,
            border: '1px solid rgba(255,238,228,.14)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 4cqw',
            fontSize: '3cqw',
            color: '#564E49',
          }}
        >
          Message your coach…
        </div>
        <span className="grid h-[10cqw] w-[10cqw] place-items-center rounded-full bg-gradient-brand text-brand-ink">
          <Icon name="mic" style={{ width: '4.4cqw' }} />
        </span>
      </MRow>
    </>
  );
}

/** Phone screen panel (design .phone-stage [data-panel]); content keeps its size and clips at the bottom. */
const screenPanel = 'flex flex-col gap-[3.4cqw] overflow-hidden px-[6cqw] pb-[4cqw] pt-[2cqw] [&>*]:shrink-0';

/** "Your coaching. In their pocket." — the client app, tab by tab. */
export function AppStory({ k }: { k: number }) {
  const { t } = useSiteT();
  const { active, goTo, rowRef, stepRef } = useStepStory(KEYS);
  const screens: Record<Key, ReactNode> = {
    today: <TodayScreen />,
    train: <TrainScreen live={active === 'train'} />,
    fuel: <FuelScreen />,
    progress: <ProgressScreen />,
    inbox: <InboxScreen />,
  };
  return (
    <Section id="app" k={k} labelledBy="h-app" glow={{ gx: '15%', gy: '55%', hx: '88%', hy: '15%', ga: 'rgba(255,76,1,.15)' }}>
      <Halo style={{ width: 600, height: 600, background: 'rgba(255,139,2,.14)', insetInlineEnd: -220, top: '25%' }} />
      <SectionWrap>
        <SecHead ns="app" id="h-app" />
        <StoryGrid phone>
          <Stage sh="340px">
            <div className="mx-auto" style={{ width: 'min(330px,74vw,calc((100vh - 140px) * .4737))' }}>
              <PhoneFrame>
                <PhoneStatus />
                <div className={cx(phoneMk, 'relative min-h-0 flex-1')}>
                  {KEYS.map((key) => (
                    <Panel key={key} abs on={active === key} className={screenPanel}>
                      {screens[key]}
                    </Panel>
                  ))}
                </div>
                <PhoneTabBar active={active as PhoneTab} onSelect={(tab) => goTo(tab)} badge={2} />
              </PhoneFrame>
            </div>
            <Dots
              items={[
                { key: 'today', label: 'Today' },
                { key: 'train', label: 'Train' },
                { key: 'fuel', label: 'Fuel' },
                { key: 'progress', label: 'Progress' },
                { key: 'inbox', label: 'Inbox' },
              ]}
              active={active}
              onGo={goTo}
            />
          </Stage>
          <Steps rowRef={rowRef}>
            {KEYS.map((key) => (
              <Step
                key={key}
                stepKey={key}
                on={active === key}
                stepRef={stepRef(key)}
                n={t(`app.steps.${key}.n`)}
                title={t(`app.steps.${key}.title`)}
                body={t(`app.steps.${key}.body`)}
              >
                {key === 'train' && <TrainFlow labels={t('app.steps.train.flow', { returnObjects: true }) as string[]} />}
              </Step>
            ))}
          </Steps>
        </StoryGrid>
      </SectionWrap>
    </Section>
  );
}

/** Coach programs → client performs → history kept (design .train-flow). */
function TrainFlow({ labels }: { labels: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {labels.map((label, i) => (
        <span key={label} className="contents">
          {i > 0 && <Icon name="arrowR" style={{ width: 14 }} className="text-site-tx4 rtl:-scale-x-100" />}
          <span className="inline-flex items-center gap-2 rounded-full border border-site-line2 bg-surface-raised px-[14px] py-2 text-[14px] text-earth">
            <b className="font-mono text-[11px] font-medium text-brand-hover">0{i + 1}</b>
            <i className="not-italic">{label}</i>
          </span>
        </span>
      ))}
    </div>
  );
}
