import { useState, type CSSProperties, type ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { MAv, MCard, MIc, meyClass, mhClass, mlClass, mnumClass, MPill, MRow, msClass, mkClass, mtClass, UA_P } from '../components/mock';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { capClass, SecHead } from '../components/type';
import b from './build.module.css';

type Tab = 'w' | 'n' | 'c';
const S2 = '#1B1714';

/** Library row (design .lib-row / .pick). */
function LibRow({ icon, title, sub, pick, thumb }: { icon: IconName; title: string; sub: string; pick?: boolean; thumb?: CSSProperties }) {
  return (
    <div className={cx('flex items-center gap-[.8em] rounded-[.8em] border px-[.7em] py-[.6em]', pick ? 'border-[rgba(255,139,2,.4)] bg-site-brand-tint' : 'border-transparent bg-surface-raised')}>
      <span
        className="grid h-[2.6em] w-[2.6em] flex-none place-items-center rounded-[.6em] bg-[linear-gradient(150deg,#3a2c1e,#241a12_60%,#140d08)] text-[rgba(255,255,255,.65)]"
        style={thumb}
      >
        <Icon name={icon} size="1em" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx(mtClass, UA_P)}>{title}</p>
        <p className={cx(msClass, UA_P)}>{sub}</p>
      </div>
      {pick && <Icon name="plus" style={{ color: '#FFB208', width: '1.2em' }} />}
    </div>
  );
}

/** Plan line: name + prescription (design .m-row > p.m-t.m-grow + .m-num.m-s). */
function PlanRow({ name, rx, style }: { name: string; rx: string; style?: CSSProperties }) {
  return (
    <MRow style={style}>
      <p className={cx(mtClass, UA_P, 'min-w-0 flex-1')}>{name}</p>
      <span className={cx(mnumClass, msClass)}>{rx}</span>
    </MRow>
  );
}

const picked: CSSProperties = { background: 'rgba(255,139,2,.13)', borderColor: 'rgba(255,139,2,.35)' };
const note = (text: string) => (
  <p className={cx(msClass, UA_P)} style={{ marginTop: '.3em', color: '#FFC94D' }}>
    {text}
  </p>
);

const CARDIO: [string, string, string, 'info' | 'bad', number][] = [
  ['Mon', 'Zone 2 bike', '35 min', 'info', 2],
  ['Wed', 'Intervals', '18 min', 'bad', 4],
  ['Thu', 'Zone 2 walk', '40 min', 'info', 2],
  ['Sun', 'Steady row', '25 min', 'info', 2],
];
const TONE = { info: { c: '#5B8DEF', b: 'rgba(91,141,239,.14)' }, bad: { c: '#F0483E', b: 'rgba(240,72,62,.14)' } };

function Library({ tab }: { tab: Tab }) {
  if (tab === 'w')
    return (
      <>
        <LibRow icon="play" title="Incline DB press" sub="Chest · Dumbbell" />
        <LibRow icon="play" title="Lat pulldown" sub="Back · Cable" pick />
        <LibRow icon="play" title="Leg press" sub="Legs · Machine" />
        <LibRow icon="edit" title="Your custom exercise" sub="Video + cues" thumb={{ background: '#241E1A' }} />
      </>
    );
  if (tab === 'n')
    return (
      <>
        <LibRow icon="meal" title="Chicken breast" sub="Protein · 165 kcal /100g" thumb={{ background: '#241E1A' }} />
        <LibRow icon="meal" title="Basmati rice" sub="Carbs · 130 kcal /100g" pick thumb={{ background: '#241E1A' }} />
        <LibRow icon="meal" title="Foul medames" sub="Custom food" thumb={{ background: '#241E1A' }} />
        <LibRow icon="heart" title="Creatine 5g" sub="Supplement" thumb={{ background: '#241E1A' }} />
      </>
    );
  return (
    <>
      <LibRow icon="activity" title="Zone 2 walk" sub="Steady · 60–70% HR" pick thumb={{ background: TONE.info.b, color: TONE.info.c }} />
      <LibRow icon="bolt" title="Intervals" sub="8 × 30s hard / 90s easy" thumb={{ background: TONE.bad.b, color: TONE.bad.c }} />
      <LibRow icon="activity" title="Steady row" sub="Zone 2 · 25 min" thumb={{ background: TONE.info.b, color: TONE.info.c }} />
    </>
  );
}

function PlanHead({ eyebrow, title, pill }: { eyebrow: string; title: string; pill?: string }) {
  return (
    <MRow>
      <div className="min-w-0 flex-1">
        <p className={cx(meyClass, UA_P)}>{eyebrow}</p>
        <p className={cx(mhClass, UA_P)} style={{ fontSize: '1.5em', marginTop: '.2em' }}>
          {title}
        </p>
      </div>
      {pill && (
        <MPill tone="mute" dot={false}>
          {pill}
        </MPill>
      )}
    </MRow>
  );
}

function Plan({ tab }: { tab: Tab }) {
  if (tab === 'w')
    return (
      <>
        <PlanHead eyebrow="Day 1 · Thursday" title="Upper A" pill="21 sets" />
        <MCard style={{ background: S2 }}>
          <PlanRow name="A1 · Bench press" rx="4 × 8 · 80 kg" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4em', marginTop: '.6em' }}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={mnumClass} style={{ textAlign: 'center', fontSize: '.78em', padding: '.4em 0', borderRadius: '.5em', background: '#241E1A' }}>
                {n < 4 ? '80×8' : '70×8'}
              </span>
            ))}
          </div>
        </MCard>
        <MCard style={picked}>
          <PlanRow name="B1 · Lat pulldown" rx="3 × 12 · 60 kg" />
          {note('Just added from library')}
        </MCard>
        <MCard style={{ background: S2 }}>
          <PlanRow name="C1 · Lateral raise" rx="3 × 15 · 90s rest" />
        </MCard>
      </>
    );
  if (tab === 'n')
    return (
      <>
        <PlanHead eyebrow="Meal 2 · Lunch" title="640 kcal" pill="P52 C71 F14" />
        <MCard style={{ background: S2 }}>
          <PlanRow name="Chicken breast" rx="180 g" />
        </MCard>
        <MCard style={picked}>
          <PlanRow name="Basmati rice" rx="200 g" />
          {note('Portion scales macros automatically')}
        </MCard>
        <MCard style={{ background: S2 }}>
          <p className={cx(mlClass, UA_P)}>Approved alternatives</p>
          <div style={{ display: 'flex', gap: '.4em', marginTop: '.5em', flexWrap: 'wrap' }}>
            <MPill tone="mute" dot={false}>
              Potato 300g
            </MPill>
            <MPill tone="mute" dot={false}>
              Pasta 180g
            </MPill>
          </div>
        </MCard>
      </>
    );
  return (
    <>
      <PlanHead eyebrow="Weekly cardio" title="4 sessions · 118 min" />
      {CARDIO.map(([day, name, mins, tone, zone]) => (
        <MCard key={day} style={{ background: S2 }}>
          <MRow>
            <MIc
              name={tone === 'bad' ? 'bolt' : 'activity'}
              style={{ width: '2em', height: '2em', background: TONE[tone].b, color: TONE[tone].c }}
              iconStyle={{ width: '1em' }}
            />
            <p className={cx(mtClass, UA_P, 'min-w-0 flex-1')} style={{ fontSize: '.9em' }}>
              {day} · {name}
            </p>
            <span className={cx(mnumClass, msClass)}>{mins}</span>
          </MRow>
          <div style={{ display: 'flex', gap: 2, height: '.45em', marginTop: '.6em' }}>
            {[1, 2, 3, 4, 5].map((x) => (
              <i key={x} style={{ flex: 1, borderRadius: 2, background: x === zone ? TONE[tone].c : '#2E2621' }} />
            ))}
          </div>
        </MCard>
      ))}
    </>
  );
}

/** A flow column (design .flow-col / .hi) with its numbered caption. */
function Col({ hi, label, n, children }: { hi?: boolean; label: string; n: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col gap-3 rounded-[18px] border p-[18px] [container-type:inline-size]',
        hi ? 'border-site-line2 bg-gradient-surface-hi shadow-site-3' : 'border-site-line bg-surface-card',
      )}
    >
      <div className={cx(capClass, 'flex items-center justify-between')}>
        <span>{label}</span>
        <span className="font-mono" style={{ color: '#564E49' }}>
          {n}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The marching arrow between columns (rotates to point down when stacked). */
function FlowArrow() {
  return (
    <div className="grid place-items-center text-brand max-[899px]:h-7" aria-hidden="true">
      <svg viewBox="0 0 44 16" className={cx(b.arrow, 'h-4 w-11 overflow-visible max-[899px]:rotate-90 min-[900px]:rtl:-scale-x-100')}>
        <path d="M2 8h36" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path className={b.head} d="M34 3l6 5-6 5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    </div>
  );
}

const panelClass = cx(b.panel, 'flex flex-col gap-[.7em]');
const colMk = cx(mkClass, 'text-[clamp(10px,4.4cqw,13px)]');

const LIBS: [IconName, string][] = [
  ['dumbbell', 'exercises'],
  ['edit', 'custom'],
  ['meal', 'foods'],
  ['grid', 'groups'],
  ['plus', 'customFoods'],
  ['heart', 'supplements'],
  ['copy', 'templates'],
];

/** Programming — library → plan → client, switchable between workout, nutrition and cardio. */
export function Build({ k }: { k: number }) {
  const { t } = useSiteT();
  const [tab, setTab] = useState<Tab>('w');
  return (
    <Section
      id="build"
      k={k}
      labelledBy="h-build"
      style={{ background: 'linear-gradient(180deg,transparent,#141110 30%,#141110 70%,transparent)' }}
      glow={{ gx: '90%', gy: '25%', hx: '15%', hy: '90%' }}
    >
      <SectionWrap>
        <SecHead ns="build" id="h-build" center />
        <Reveal>
          <div className="flex justify-center">
            <div role="tablist" aria-label={t('build.planType')} className="inline-flex gap-[2px] rounded-full border border-site-line2 bg-surface-raised p-1">
              {(['w', 'n', 'c'] as Tab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  data-tab={id}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cx(
                    'min-h-[40px] cursor-pointer rounded-full border-0 px-[18px] font-mono text-[12px] uppercase leading-[normal] tracking-[.06em] transition-all duration-[250ms] ease-card rtl:font-site-ar rtl:text-[14px] rtl:normal-case rtl:tracking-normal',
                    tab === id ? 'bg-surface-strong text-earth shadow-[0_1px_2px_rgba(0,0,0,.4)]' : 'bg-transparent text-earth-muted',
                  )}
                >
                  {t(`build.tabs.${id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-7 grid items-stretch gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_44px_minmax(0,1.25fr)_44px_minmax(0,.9fr)]">
            <Col label={t('build.cols.library')} n="01">
              <div dir="ltr" className={cx(colMk, 'rtl:font-sans')}>
                <div key={tab} className={panelClass}>
                  <Library tab={tab} />
                </div>
              </div>
            </Col>
            <FlowArrow />
            <Col hi label={t('build.cols.plan')} n="02">
              <div dir="ltr" className={cx(colMk, 'rtl:font-sans')}>
                <div key={tab} className={panelClass}>
                  <Plan tab={tab} />
                </div>
              </div>
            </Col>
            <FlowArrow />
            <Col label={t('build.cols.client')} n="03">
              <div dir="ltr" className={cx(colMk, 'rtl:font-sans')} style={{ display: 'flex', flexDirection: 'column', gap: '.8em' }}>
                <MRow>
                  <MAv>SF</MAv>
                  <div className="min-w-0 flex-1">
                    <p className={cx(mtClass, UA_P)}>Salma Fathy</p>
                    <p className={cx(msClass, UA_P)}>Assigned · live now</p>
                  </div>
                  <MPill tone="ok">Live</MPill>
                </MRow>
                <MCard style={{ background: S2 }}>
                  <p className={cx(mlClass, UA_P)}>Appears in her app</p>
                  <div style={{ display: 'flex', gap: '.4em', marginTop: '.6em', flexWrap: 'wrap' }}>
                    <MPill tone="brand" dot={false}>
                      Today
                    </MPill>
                    <MPill tone="brand" dot={false}>
                      Train
                    </MPill>
                    <MPill tone="mute" dot={false}>
                      Fuel
                    </MPill>
                  </div>
                </MCard>
                <MCard style={{ background: S2 }}>
                  <p className={cx(mlClass, UA_P)}>Also assigned to</p>
                  <MRow style={{ marginTop: '.6em', gap: '.3em' }}>
                    {['NM', 'YS', 'LK'].map((a) => (
                      <MAv key={a} style={{ width: '2em', height: '2em' }}>
                        {a}
                      </MAv>
                    ))}
                    <span className={msClass} style={{ marginInlineStart: '.4em' }}>
                      + 9 more
                    </span>
                  </MRow>
                </MCard>
              </div>
            </Col>
          </div>
        </Reveal>
        <div className="mt-4 grid gap-[14px] min-[760px]:grid-cols-3">
          {(['s1', 's2', 's3'] as const).map((s, i) => (
            <Reveal key={s} d={i} className="flex items-start gap-[14px] rounded-[18px] border border-site-line bg-[linear-gradient(160deg,#141110,#0C0A09)] p-5">
              <b className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full border border-[rgba(255,139,2,.35)] font-mono text-[12px] font-medium text-brand-hover">
                0{i + 1}
              </b>
              <div>
                <h4 className="mb-1 mt-0 text-[16px] font-semibold">{t(`build.steps.${s}.h`)}</h4>
                <p className="m-0 text-[14px] text-earth-muted">{t(`build.steps.${s}.p`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-7 flex flex-wrap justify-center gap-2">
          {LIBS.map(([icon, key]) => (
            <span key={key} className="inline-flex items-center gap-2 rounded-full border border-site-line px-[14px] py-2 text-[14px] text-earth-muted">
              <Icon name={icon} style={{ width: 15 }} className="text-brand-hover" />
              <b className="font-normal">{t(`build.libs.${key}`)}</b>
            </span>
          ))}
        </Reveal>
      </SectionWrap>
    </Section>
  );
}
