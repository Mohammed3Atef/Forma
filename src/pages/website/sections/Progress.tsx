import { useState, type ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { capClass, SecHead } from '../components/type';
import { ProgressStrip } from '../components/ProgressStrip';

/** Weight series per range (design home inline script DATA). */
const SERIES = {
  '4w': [62.6, 62.4, 62.3, 62.1, 61.9, 61.8, 61.8, 61.6],
  '12w': [64.4, 64.1, 63.9, 63.4, 63.2, 62.8, 62.6, 62.3, 62.1, 61.9, 61.8, 61.6],
  '6m': [66.8, 66.1, 65.6, 65.0, 64.4, 63.9, 63.3, 62.8, 62.3, 61.9, 61.6],
} as const;
type Range = keyof typeof SERIES;

/** Line path + area path for a series in the 600×200 chart box. */
function chartPaths(v: readonly number[]) {
  const mn = Math.min(...v) - 0.4,
    mx = Math.max(...v) + 0.4,
    W = 600,
    H = 200,
    pad = 14;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * W, pad + (1 - (y - mn) / (mx - mn)) * (H - pad * 2)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return { line, area: `${line} L${W} ${H} L0 ${H}Z` };
}

const ease = 'cubic-bezier(.16,1,.3,1)';

/** Bento card (design .bc / .bc.hi). Children sit above the halo. */
function Card({ hi, className, d, children }: { hi?: boolean; className?: string; d?: number; children: ReactNode }) {
  return (
    <Reveal
      d={d}
      className={cx(
        'relative flex min-w-0 flex-col gap-[14px] overflow-hidden rounded-[24px] border p-[clamp(18px,2.2vw,26px)] [container-type:inline-size] [&>*]:relative [&>*]:z-[1]',
        hi
          ? "border-site-line2 bg-gradient-surface-hi after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-['']"
          : 'border-site-line bg-surface-card',
        className,
      )}
    >
      {children}
    </Reveal>
  );
}

function CardHead({ title, sub, children }: { title: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="m-0 text-[16px] font-semibold">{title}</h3>
        <p className="mb-0 mt-1 text-[14px] text-site-tx3">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function WeightChart() {
  const { t } = useSiteT();
  const [range, setRange] = useState<Range>('12w');
  const v = SERIES[range];
  const { line, area } = chartPaths(v);
  const delta = (v[v.length - 1] - v[0]).toFixed(1).replace('-', '−') + ' kg';
  return (
    <Card hi className="min-[900px]:col-span-4">
      <CardHead
        title={t('progress.weight')}
        sub={
          <>
            <span className="font-mono text-earth">61.6 kg</span> · <span className="text-success">{delta}</span>
          </>
        }
      >
        <div role="group" aria-label={t('progress.range')} className="inline-flex gap-[2px] rounded-full border border-site-line bg-surface-raised p-[3px]">
          {(Object.keys(SERIES) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cx(
                'min-h-[32px] cursor-pointer rounded-full border-0 px-[11px] py-[6px] font-mono text-[11px] leading-[normal]',
                r === range ? 'bg-surface-strong text-earth' : 'bg-transparent text-site-tx3',
              )}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHead>
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: 'clamp(170px,22vw,240px)', direction: 'ltr' }}>
        <g stroke="rgba(255,238,228,.07)">
          <line x1="0" y1="50" x2="600" y2="50" />
          <line x1="0" y1="100" x2="600" y2="100" />
          <line x1="0" y1="150" x2="600" y2="150" />
        </g>
        {/* area fades in, line draws in, both morph between ranges */}
        <path
          d={area}
          fill="url(#hg1)"
          className="opacity-0 group-data-[in=true]/rv:opacity-100 motion-reduce:opacity-100"
          style={{ transition: `opacity 1s .8s, d .7s ${ease}` }}
        />
        <path
          d={line}
          pathLength={1}
          fill="none"
          stroke="url(#hg2)"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1"
          className="[stroke-dashoffset:1] group-data-[in=true]/rv:[stroke-dashoffset:0] motion-reduce:[stroke-dashoffset:0]"
          style={{ transition: `stroke-dashoffset 1.6s ${ease} .2s, d .7s ${ease}` }}
        />
      </svg>
      <div className={cx(capClass, 'flex justify-between')} style={{ direction: 'ltr' }}>
        <span>{t(`progress.from.${range}`)}</span>
        <span style={{ color: '#FFB208' }}>Today</span>
      </div>
    </Card>
  );
}

const MEASUREMENTS: [string, string, string, string][] = [
  ['waist', '−2.0', '71', '#3FB27F'],
  ['hips', '−1.0', '94', '#3FB27F'],
  ['chest', '+1.0', '96', '#3FB27F'],
  ['arm', '+0.5', '30.5', '#3FB27F'],
  ['thigh', '0.0', '56', '#7C726C'],
];
const LIFTS: [string, number, number, boolean][] = [
  ['Bench', 68, 102, false],
  ['Squat', 88, 131, true],
  ['Deadlift', 100, 150, false],
  ['OHP', 38, 57, false],
];

/** "Progress you can actually see" — weight, measurements, photos, performance. */
export function Progress({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section id="progress" k={k} labelledBy="h-prog" glow={{ gx: '85%', gy: '40%', hx: '10%', hy: '20%', gb: 'rgba(47,184,176,.07)' }}>
      <SectionWrap>
        <SecHead ns="progress" id="h-prog" />
        <div className="grid grid-cols-1 gap-[14px] min-[900px]:grid-cols-6">
          <WeightChart />
          <Card d={1} className="min-[900px]:col-span-2">
            <CardHead title={t('progress.measurements')} sub={t('progress.measurementsSub')} />
            <div className="flex flex-col">
              {MEASUREMENTS.map(([key, delta, value, color]) => (
                <div key={key} className="flex items-center justify-between border-b border-site-line py-[11px] text-[14px] last:border-b-0">
                  <span>{t(`progress.parts.${key}`)}</span>
                  <span>
                    <em className="me-[10px] font-mono text-[12px] not-italic" style={{ color }}>
                      {delta}
                    </em>
                    <b className="font-mono text-[15px] font-medium">{value}</b> cm
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="min-[900px]:col-span-3">
            <CardHead title={t('progress.photos')} sub={t('progress.photosSub')} />
            <ProgressStrip alt={t('progress.photosAlt')} />
          </Card>
          <Card d={1} className="min-[900px]:col-span-3">
            <CardHead title={t('progress.performance')} sub={t('progress.performanceSub')} />
            <div className="flex h-[150px] items-end gap-[10px]" style={{ direction: 'ltr' }}>
              {LIFTS.map(([name, h, value, on], i) => (
                <i
                  key={name}
                  className={cx(
                    'relative flex-1 origin-bottom scale-y-0 rounded-[8px_8px_3px_3px] transition-transform duration-1000 ease-card [transition-delay:calc(var(--k,0)*50ms)] group-data-[in=true]/rv:scale-y-100 motion-reduce:scale-y-100 motion-reduce:transition-none',
                    on ? 'bg-gradient-brand' : 'bg-surface-strong',
                  )}
                  style={{ height: `${h}%`, ['--k' as string]: i }}
                >
                  <b className="absolute inset-x-0 -top-[22px] text-center font-mono text-[11px] font-medium not-italic leading-[normal] text-earth-muted">{value}</b>
                </i>
              ))}
            </div>
            <div className={capClass} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, textAlign: 'center', direction: 'ltr' }}>
              {LIFTS.map(([name]) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </Card>
        </div>
      </SectionWrap>
    </Section>
  );
}
