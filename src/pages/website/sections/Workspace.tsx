import type { CSSProperties } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { useStepStory } from '../hooks/useStepStory';
import { cx } from '../cx';
import { ProductFrame } from '../components/frames';
import { Halo } from '../components/layout';
import { Kpi, MAv, MBar, MBtn, MBub, MCard, MDiv, MIc, meyClass, mlClass, mnumClass, MPill, MRow, msClass, mtClass, UA_P } from '../components/mock';
import { Section, SectionWrap } from '../components/Section';
import { Dots, Panel, Stage, Step, Steps, StepTags, StoryGrid } from '../components/StepStory';
import { SecHead } from '../components/type';
import { ProgressStrip } from '../components/ProgressStrip';

const KEYS = ['train', 'fuel', 'body', 'talk'] as const;
type Key = (typeof KEYS)[number];
const TABS: { key: Key; label: string }[] = [
  { key: 'train', label: 'Workout' },
  { key: 'fuel', label: 'Nutrition' },
  { key: 'body', label: 'Progress' },
  { key: 'talk', label: 'Check-ins & messages' },
];
const OK = '#3FB27F';
const TX2 = '#ABA19B';
const TX3 = '#7C726C';
const g2m: CSSProperties = { display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '1em' };
const col = (gap: string): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });

/** Round check used in the workout and meal lists. */
function Check({ done = true }: { done?: boolean }) {
  return (
    <MIc
      name="check"
      style={{ width: '1.8em', height: '1.8em', borderRadius: '50%', ...(done ? { background: OK, color: '#06210f' } : { border: '1.5px solid rgba(255,238,228,.14)', color: '#564E49' }) }}
      iconStyle={{ width: '1em' }}
    />
  );
}

/**
 * Small trend line (design .draw). Drawn statically: in the design it only drew under
 * reduced motion (it waited for an .in class nothing in this section sets). Inline like
 * the design's <svg>, so it keeps the same baseline gap below it.
 */
function Spark({ d, area, viewBox, height, marginTop }: { d: string; area?: string; viewBox: string; height: string; marginTop?: string }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" style={{ display: 'inline', verticalAlign: 'baseline', width: '100%', height, marginTop, direction: 'ltr' }}>
      {area && <path d={area} fill="url(#hg1)" />}
      <path pathLength={1} d={d} fill="none" stroke="url(#hg2)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

function TrainPanel() {
  const ex: [string, string][] = [
    ['Bench press', '4 × 9 · 80kg'],
    ['Incline DB press', '3 × 10 · 30kg'],
    ['Lat pulldown', '3 × 12 · 60kg'],
    ['Seated row', '3 × 12 · 55kg'],
    ['Lateral raise', '3 × 15 · 12kg'],
  ];
  return (
    <div style={g2m}>
      <MCard style={col('.7em')}>
        <MRow>
          <p className={cx(meyClass, UA_P, 'min-w-0 flex-1')}>Today · Upper A</p>
          <MPill tone="ok">Completed</MPill>
        </MRow>
        {ex.map(([name, rx]) => (
          <MRow key={name}>
            <Check />
            <p className={cx(mtClass, UA_P, 'min-w-0 flex-1')} style={{ fontSize: '.92em' }}>
              {name}
            </p>
            <span className={cx(mnumClass, msClass)}>{rx}</span>
          </MRow>
        ))}
      </MCard>
      <div style={col('1em')}>
        <MCard>
          <p className={cx(mlClass, UA_P)}>Bench press · est. 1RM</p>
          <p className={mnumClass} style={{ fontSize: '2em', margin: '.2em 0' }}>
            102<span style={{ fontSize: '.5em', color: TX3 }}> kg</span>
          </p>
          <p className={cx(msClass, UA_P)} style={{ color: OK }}>
            +7.5 kg since week 1
          </p>
          <Spark viewBox="0 0 300 70" height="4.5em" marginTop=".6em" d="M0 60 L60 52 L120 46 L180 34 L240 26 L300 14" />
        </MCard>
        <div className="grid gap-[.7em]" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Kpi label="Sessions · 4w" value="15/16" />
          <Kpi label="Volume · wk" value="18.4t" />
        </div>
      </div>
    </div>
  );
}

function FuelPanel() {
  const meals: [string, string, number, boolean][] = [
    ['Breakfast', 'Oats · Whey · Berries', 512, true],
    ['Lunch', 'Chicken · Rice · Greens', 640, true],
    ['Snack', 'Greek yogurt · Almonds', 288, true],
    ['Dinner', 'Salmon · Potato', 610, false],
  ];
  const macros: [string, number, number, string][] = [
    ['Protein', 134, 158, '#FF8B02'],
    ['Carbs', 147, 195, '#8B7CF0'],
    ['Fat', 40, 66, '#2FB8B0'],
  ];
  return (
    <div style={g2m}>
      <MCard style={col('.75em')}>
        <p className={cx(meyClass, UA_P)}>Meal plan · 2,050 kcal</p>
        {meals.map(([name, food, kcal, done]) => (
          <MRow key={name}>
            <Check done={done} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={{ fontSize: '.92em' }}>
                {name}
              </p>
              <p className={cx(msClass, UA_P)}>{food}</p>
            </div>
            <span className={cx(mnumClass, msClass)}>{kcal}</span>
          </MRow>
        ))}
      </MCard>
      <MCard style={col('.9em')}>
        <p className={cx(mlClass, UA_P)}>Today's macros</p>
        {macros.map(([label, v, target, color]) => (
          <div key={label}>
            <MRow>
              <span className={cx(msClass, 'min-w-0 flex-1')}>{label}</span>
              <span className={mnumClass} style={{ fontSize: '.85em' }}>
                {v}
                <span style={{ color: TX3 }}>/{target}g</span>
              </span>
            </MRow>
            <MBar value={`${(v / target) * 100}%`} style={{ marginTop: '.35em' }} fillStyle={{ background: color, transform: 'none' }} />
          </div>
        ))}
        <MDiv />
        <p className={cx(mlClass, UA_P)}>Approved swaps · Rice</p>
        <div style={{ display: 'flex', gap: '.4em', flexWrap: 'wrap' }}>
          <MPill tone="mute" dot={false}>
            Basmati 200g
          </MPill>
          <MPill tone="mute" dot={false}>
            Potato 300g
          </MPill>
        </div>
      </MCard>
    </div>
  );
}

function BodyPanel() {
  const meas: [string, string, string][] = [
    ['Waist', '71 cm', '−2.0'],
    ['Hips', '94 cm', '−1.0'],
    ['Chest', '96 cm', '+1.0'],
    ['Arm', '30.5 cm', '+0.5'],
    ['Thigh', '56 cm', '+0.5'],
    ['Calf', '37 cm', '+0.2'],
  ];
  return (
    <div style={g2m}>
      <MCard>
        <MRow>
          <p className={cx(mlClass, UA_P, 'min-w-0 flex-1')}>Bodyweight · 12 weeks</p>
          <span className={mnumClass} style={{ color: OK }}>
            −2.8 kg
          </span>
        </MRow>
        <p className={mnumClass} style={{ fontSize: '2em', margin: '.3em 0' }}>
          61.8<span style={{ fontSize: '.5em', color: TX3 }}> kg</span>
        </p>
        <Spark
          viewBox="0 0 300 90"
          height="6em"
          d="M0 12 L30 16 L60 20 L90 28 L120 32 L150 40 L180 46 L210 52 L240 58 L270 62 L300 66"
          area="M0 12 L30 16 L60 20 L90 28 L120 32 L150 40 L180 46 L210 52 L240 58 L270 62 L300 66 L300 90 L0 90Z"
        />
        <ProgressStrip style={{ marginTop: '1em' }} />
      </MCard>
      <MCard style={col('.55em')}>
        <p className={cx(mlClass, UA_P)}>Measurements · vs last</p>
        {meas.map(([label, value, delta]) => (
          <MRow key={label} style={{ padding: '.35em 0', borderBottom: '1px solid rgba(255,238,228,.09)' }}>
            <span className={cx(msClass, 'min-w-0 flex-1')}>{label}</span>
            <span className={mnumClass} style={{ fontSize: '.8em', color: OK }}>
              {delta}
            </span>
            <span className={mnumClass} style={{ fontSize: '.9em', minWidth: '4.4em', textAlign: 'end' }}>
              {value}
            </span>
          </MRow>
        ))}
      </MCard>
    </div>
  );
}

function TalkPanel() {
  return (
    <div style={g2m}>
      <MCard style={col('.8em')}>
        <MRow>
          <p className={cx(meyClass, UA_P, 'min-w-0 flex-1')}>Week 9 check-in</p>
          <MPill tone="info">To review</MPill>
        </MRow>
        <div className="grid gap-[.7em]" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <Kpi label="Weight" value="61.8" valueStyle={{ fontSize: '1.2em' }} />
          <Kpi label="Energy" value="Good" valueStyle={{ fontSize: '1.2em' }} />
          <Kpi label="Sleep" value="7h" valueStyle={{ fontSize: '1.2em' }} />
        </div>
        <p className={cx(msClass, UA_P)} style={{ whiteSpace: 'normal', color: TX2 }}>
          "Bench felt easy this week. Slight tightness in right shoulder on incline."
        </p>
        <MRow style={{ marginTop: 'auto' }}>
          <MBtn sec className="min-w-0 flex-1" style={{ height: '2.5em' }}>
            Add note
          </MBtn>
          <MBtn className="min-w-0 flex-1" style={{ height: '2.5em' }}>
            Reply
          </MBtn>
        </MRow>
      </MCard>
      <div style={col('1em')}>
        <MCard style={col('.55em')}>
          <p className={cx(mlClass, UA_P)}>Messages</p>
          <MBub style={{ fontSize: '.88em' }}>Sending my week 9 photos now</MBub>
          <MBub me style={{ fontSize: '.88em' }}>
            Got them — shoulders look great.
          </MBub>
        </MCard>
        <MCard style={{ background: '#1B1714' }}>
          <p className={cx(mlClass, UA_P)}>Coach note · private</p>
          <p className={cx(msClass, UA_P)} style={{ whiteSpace: 'normal', color: TX2, marginTop: '.4em' }}>
            Neutral grip on incline until the shoulder settles.
          </p>
        </MCard>
      </div>
    </div>
  );
}

const PANELS: Record<Key, () => JSX.Element> = { train: TrainPanel, fuel: FuelPanel, body: BodyPanel, talk: TalkPanel };

/** "One client. The whole picture." — the 360° client workspace, step by step. */
export function Workspace({ k }: { k: number }) {
  const { t } = useSiteT();
  const { active, goTo, rowRef, stepRef } = useStepStory(KEYS);
  return (
    <Section id="workspace" k={k} labelledBy="h-ws" glow={{ gx: '8%', gy: '40%', hx: '92%', hy: '12%', gb: 'rgba(139,124,240,.08)' }}>
      <Halo style={{ width: 560, height: 480, background: 'rgba(255,139,2,.12)', insetInlineStart: -200, top: '20%' }} />
      <SectionWrap>
        <SecHead ns="workspace" id="h-ws" />
        <StoryGrid>
          <Stage sh="290px">
            <ProductFrame>
              <div className="flex min-h-[39em] flex-col">
                <div className="flex items-center gap-[1em] border-b border-site-line bg-[linear-gradient(180deg,#1B1714,#141110)] px-[1.6em] pb-[1.1em] pt-[1.4em]">
                  <MAv lg>SF</MAv>
                  <div className="min-w-0 flex-1">
                    <p className={cx(mtClass, UA_P)} style={{ fontSize: '1.5em' }}>
                      Salma Fathy
                    </p>
                    <p className={cx(msClass, UA_P)}>Hypertrophy · Phase 2 · Week 9 of 12 · renews 12 Dec</p>
                  </div>
                  <MPill tone="ok">Active</MPill>
                  <MBtn sec style={{ height: '2.4em', padding: '0 1.1em' }}>
                    Message
                  </MBtn>
                </div>
                {/* tab row fades at the trailing edge instead of slicing a label */}
                <div
                  role="tablist"
                  className="flex gap-[.3em] overflow-hidden border-b border-site-line px-[1.2em] [-webkit-mask-image:linear-gradient(90deg,#000_calc(100%-3em),transparent)] [mask-image:linear-gradient(90deg,#000_calc(100%-3em),transparent)] rtl:[-webkit-mask-image:linear-gradient(270deg,#000_calc(100%-3em),transparent)] rtl:[mask-image:linear-gradient(270deg,#000_calc(100%-3em),transparent)]"
                >
                  {TABS.map((tab) => (
                    <WsTab key={tab.key} goto={tab.key} on={active === tab.key} onClick={() => goTo(tab.key)}>
                      {tab.label}
                    </WsTab>
                  ))}
                  {['Assessments', 'Notes', 'Subscription'].map((label) => (
                    <WsTab key={label} disabled>
                      {label}
                    </WsTab>
                  ))}
                </div>
                <div className="relative grid flex-1 px-[1.6em] py-[1.5em]">
                  {KEYS.map((key) => {
                    const P = PANELS[key];
                    return (
                      <Panel key={key} on={active === key}>
                        <P />
                      </Panel>
                    );
                  })}
                </div>
              </div>
            </ProductFrame>
            <Dots items={TABS.map((tab) => ({ key: tab.key, label: tab.key === 'talk' ? 'Check-ins and messages' : tab.label }))} active={active} onGo={goTo} />
          </Stage>
          <Steps rowRef={rowRef}>
            {KEYS.map((key, i) => (
              <Step
                key={key}
                stepKey={key}
                on={active === key}
                stepRef={stepRef(key)}
                n={`0${i + 1}`}
                title={t(`workspace.steps.${key}.title`)}
                body={t(`workspace.steps.${key}.body`)}
              >
                <StepTags tags={t(`workspace.steps.${key}.tags`, { returnObjects: true }) as string[]} />
              </Step>
            ))}
          </Steps>
        </StoryGrid>
      </SectionWrap>
    </Section>
  );
}

/** Workspace tab (design .ws-tabs button): orange underline when active; the trailing three are inert. */
function WsTab({ goto, on, disabled, onClick, children }: { goto?: string; on?: boolean; disabled?: boolean; onClick?: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      data-goto={goto}
      aria-selected={disabled ? undefined : on}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={onClick}
      style={disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
      className={cx(
        'relative cursor-pointer whitespace-nowrap border-0 bg-transparent px-[.9em] py-[1.1em] font-mono text-[.74em] uppercase leading-[normal] tracking-[.07em]',
        on
          ? "text-earth after:absolute after:inset-x-[.9em] after:-bottom-px after:h-[2px] after:rounded-[2px] after:bg-gradient-brand after:content-['']"
          : 'text-site-tx3',
      )}
    >
      {children}
    </button>
  );
}
