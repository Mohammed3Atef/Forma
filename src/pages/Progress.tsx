import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useCardio } from '@/stores/cardioStore';
import { useWorkout } from '@/stores/workoutStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/services/auth/sessionStore';
import { cloudAvailable } from '@/data/dataSource';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { BarChart, LineChart } from '@/components/charts';
import { logVolume, logSetCount, prByExercise } from '@/lib/calc';
import { muscleColor, muscleLabel } from '@/lib/muscle';
import { parseDecimal, shortDate, today, weekStartOf, addDays } from '@/lib/utils';
import { ProgressPhotosBody } from '@/pages/ProgressPhotos';

// Matches the prototype's 4-tab Progress screen exactly (Weight / Strength / Measure / Photos).
type Tab = 'weight' | 'strength' | 'measure' | 'photos';

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Measurement parts where a decrease is the improvement.
const GOOD_WHEN_DOWN = new Set(['waist', 'abdomen', 'bodyweight', 'hips']);

export function Progress() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const weightLogs = useCardio((s) => s.weightLogs);
  const logWeight = useCardio((s) => s.logWeight);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const measureLogs = useMeasurements((s) => s.logs);
  const profileWeight = useSettings((s) => s.profile?.weightKg);
  const [tab, setTab] = useState<Tab>('weight');

  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);

  const overview = useMemo(() => {
    const curMon = weekStartOf(new Date()).getTime();
    const buckets = Array.from({ length: 8 }, () => 0);
    finished.forEach((l) => {
      const wkMon = weekStartOf(parseDay(l.date)).getTime();
      const idx = 7 - Math.round((curMon - wkMon) / (7 * 86_400_000));
      if (idx >= 0 && idx < 8) buckets[idx] += logVolume(l);
    });
    const totalVol = finished.reduce((v, l) => v + logVolume(l), 0);
    const totalSets = finished.reduce((n, l) => n + logSetCount(l), 0);
    const durations = finished.filter((l) => l.durationSec > 0);
    const avgDur = durations.length ? Math.round(durations.reduce((s, l) => s + l.durationSec, 0) / durations.length / 60) : 0;

    // Muscle split — completed-set counts per muscle.
    const byMuscle = new Map<string, number>();
    finished.forEach((l) =>
      l.exercises.forEach((ex) => {
        const muscle = plan?.exercises[ex.exerciseId]?.targetMuscle;
        if (!muscle) return;
        const done = ex.sets.filter((s) => s.done).length;
        if (done) byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + done);
      }),
    );
    const muscles = Array.from(byMuscle.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxMuscle = muscles[0]?.[1] ?? 1;

    return {
      trend: buckets.map((v, i) => ({ label: i === 7 ? t('gt.now') : `-${7 - i}w`, value: v })),
      totalVol,
      totalSets,
      avgDur,
      workouts: finished.length,
      muscles,
      maxMuscle,
    };
  }, [finished, plan, t]);

  const records = useMemo(() => {
    const prs = Array.from(prByExercise(logs).values()).sort((a, b) => b.e1rm - a.e1rm);
    return prs;
  }, [logs]);

  const body = useMemo(() => {
    const series = weightLogs.map((w) => w.weightKg);
    const current = series.length ? series[series.length - 1] : null;

    // Change over the last ~30 days: the latest entry on/before that cutoff
    // (falls back to the oldest entry we have, so a client with only 3 weeks
    // of history still gets a real, if shorter, delta rather than nothing).
    const cutoff = addDays(today(), -30);
    const monthAgo = [...weightLogs].reverse().find((w) => w.date <= cutoff) ?? weightLogs[0];
    const monthDelta = current != null && monthAgo && monthAgo !== weightLogs[weightLogs.length - 1] ? Math.round((current - monthAgo.weightKg) * 10) / 10 : null;

    // Latest + previous value for each measurement key, plus bodyweight.
    const keyVals = (key: string): { cur: number; prev: number | null } | null => {
      if (key === 'bodyweight') {
        if (!weightLogs.length) return null;
        const cur = weightLogs[weightLogs.length - 1].weightKg;
        const prev = weightLogs.length > 1 ? weightLogs[weightLogs.length - 2].weightKg : null;
        return { cur, prev };
      }
      const withKey = measureLogs.filter((l) => typeof l.values[key] === 'number');
      if (!withKey.length) return null;
      const cur = withKey[withKey.length - 1].values[key];
      const prev = withKey.length > 1 ? withKey[withKey.length - 2].values[key] : null;
      return { cur, prev };
    };

    const latestKeys = measureLogs.length ? Object.keys(measureLogs[measureLogs.length - 1].values) : [];
    const rows = ['bodyweight', ...latestKeys]
      .map((key) => ({ key, ...(keyVals(key) ?? { cur: NaN, prev: null }) }))
      .filter((r) => !Number.isNaN(r.cur));

    return { series, current, rows, monthDelta };
  }, [weightLogs, measureLogs]);

  // Real target weight, when the client set one during their assessment —
  // never fabricated; the "to goal" stat simply doesn't render without it.
  const uid = useSession((s) => s.uid) ?? '';
  const assessmentEnabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const assessment = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: assessmentEnabled });
  const targetWeightKg = assessment.data?.goals?.targetWeightKg;
  const toGoal = targetWeightKg && body.current != null ? Math.round((body.current - targetWeightKg) * 10) / 10 : null;

  // Log today's bodyweight from the Body tab.
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightVal, setWeightVal] = useState('');
  const openWeight = () => {
    // `|| undefined` also skips an unset (0) profile weight.
    const seed = body.current ?? (profileWeight || undefined);
    setWeightVal(seed != null ? String(seed) : '');
    setWeightOpen(true);
  };
  const saveWeight = async () => {
    const n = parseDecimal(weightVal); // accepts "93.5", "93,5", Arabic digits
    if (n > 0) await logWeight(n, today());
    setWeightOpen(false);
  };

  return (
    <div className="anim-rise">
      <TopBar
        title={t('progress.title')}
        eyebrow={t('gt.yourNumbers')}
        right={
          <button type="button" onClick={() => navigate('/history')} className="icon-btn h-[42px] w-[42px]" aria-label={t('gt.history')}>
            <Icon name="calendar" size={18} />
          </button>
        }
      />

      <div className="seg mb-4">
        {(['weight', 'strength', 'measure', 'photos'] as Tab[]).map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)} className={tab === s ? 'on' : ''}>
            {t(`gt.${s}`)}
          </button>
        ))}
      </div>

      {tab === 'weight' && (
        <div className="space-y-3">
          <div className="card-featured">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="eyebrow">{t('gt.bodyweight')}</span>
              <span className="font-display text-2xl font-bold">
                {body.current ?? (profileWeight || '–')}<span className="ml-1 text-sm font-normal text-earth-muted">{t('common.kg')}</span>
              </span>
            </div>
            {body.series.length >= 2 && (
              <p className="mb-3 text-sm text-earth">
                {(() => {
                  const change = Math.round((body.series[body.series.length - 1] - body.series[0]) * 10) / 10;
                  if (change === 0) return t('gt.weightHolding');
                  return t(change < 0 ? 'gt.weightDown' : 'gt.weightUp', { n: Math.abs(change) });
                })()}
              </p>
            )}
            <LineChart data={body.series} unit={t('common.kg')} emptyLabel={t('progress.noData')} />
            <button type="button" onClick={openWeight} className="btn-ghost mt-3 w-full">
              <Icon name="plus" size={15} /> {t('home.quick.addWeight')}
            </button>
          </div>

          {(body.current != null || toGoal != null) && (
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon="scale"
                value={body.current ?? '–'}
                unit={t('common.kg')}
                label={t('gt.current')}
                delta={
                  body.monthDelta != null && body.monthDelta !== 0
                    ? { value: `${Math.abs(body.monthDelta)}${t('common.kg')} ${t('gt.thisMonth')}`, dir: body.monthDelta < 0 ? 'down' : 'up' }
                    : undefined
                }
              />
              {toGoal != null && <StatTile icon="target" value={Math.abs(toGoal)} unit={t('common.kg')} label={t('gt.toGoalLabel')} />}
            </div>
          )}
        </div>
      )}

      {tab === 'strength' && (
        <div className="space-y-3">
          <div className="card-featured">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <Icon name="trophy" size={22} />
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{t('gt.personalRecordsN', { n: records.length })}</p>
                <p className="font-mono text-[11.5px] text-earth-muted">{t('gt.est1rmSub')}</p>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {records.length === 0 && <p className="py-8 text-center text-sm text-earth-muted">{t('gt.noRecords')}</p>}
            {records.map((pr) => {
              const ex = plan?.exercises[pr.exerciseId];
              return (
                <button key={pr.exerciseId} type="button" onClick={() => navigate(`/workout/exercise/${pr.exerciseId}`)} className="row w-full text-start">
                  <span className="row-av" style={{ color: muscleColor(ex?.targetMuscle) }}>
                    <Icon name="trophy" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{ex?.name ?? pr.exerciseId}</p>
                    <p className="font-mono text-[11.5px] text-earth-muted">
                      {pr.kg}{t('common.kg')} × {pr.reps} · {shortDate(pr.date, i18n.language)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-mono text-[22px] font-medium leading-none text-brand">{pr.e1rm}<span className="text-sm text-earth-muted">{t('common.kg')}</span></p>
                    <p className="stat-label mt-0.5">{t('gt.est1rm')}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Real extra analytics the prototype doesn't show — same visual system, own sub-section. */}
          <div className="card-featured">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="eyebrow">{t('gt.weeklyVolume')}</span>
              <span className="font-mono text-[11px] text-brand">{t('gt.last8weeks')}</span>
            </div>
            {(() => {
              const nonZero = overview.trend.map((b) => b.value).filter((v) => v > 0);
              const first = nonZero[0];
              const last = nonZero[nonZero.length - 1];
              const up = first != null && last != null && last > first;
              return (
                <p className="mb-3 text-sm text-earth">
                  {nonZero.length >= 2
                    ? t(up ? 'gt.volumeTrendUp' : 'gt.volumeTrendDown', { t: (Math.abs(last - first) / 1000).toFixed(1) })
                    : t('gt.volumeTrendFlat')}
                </p>
              );
            })()}
            <BarChart data={overview.trend} format={(v) => `${Math.round(v / 1000)}t`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon="arrowUp" value={(overview.totalVol / 1000).toFixed(0)} unit="t" label={t('gt.totalVolume')} />
            <StatTile icon="dumbbell" value={overview.workouts} label={t('gt.workouts')} />
            <StatTile icon="timer" value={overview.avgDur} unit="m" label={t('gt.avgDuration')} />
            <StatTile icon="bolt" value={overview.totalSets} label={t('gt.totalSets')} />
          </div>
          {overview.muscles.length > 0 && (
            <>
              <div className="sec-head">
                <h2 className="h2">{t('gt.muscleSplit')}</h2>
              </div>
              <div className="card space-y-3">
                {overview.muscles.map(([muscle, count]) => (
                  <div key={muscle} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate font-display text-sm font-medium">{muscleLabel(muscle, t)}</span>
                    <div className="prog thin flex-1">
                      <span style={{ width: `${(count / overview.maxMuscle) * 100}%`, background: muscleColor(muscle) }} />
                    </div>
                    <span className="w-8 shrink-0 text-end font-mono text-[12px] text-earth-muted">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'measure' && (
        <div className="space-y-3">
          <div className="hdr rounded-t-xl2 border border-b-0 border-line bg-surface-card px-5">
            <p className="ui-label">{t('gt.measurements')}</p>
            <button type="button" className="sec-link inline-flex items-center gap-1" onClick={() => navigate('/progress/measurements')}>
              <Icon name="plus" size={13} /> {t('gt.log')}
            </button>
          </div>
          <div className="card -mt-3 divide-y divide-line-soft rounded-t-none p-0">
            {body.rows.length === 0 && <p className="p-5 text-center text-sm text-earth-muted">{t('measure.empty')}</p>}
            {body.rows.map((r) => {
              const delta = r.prev != null ? Math.round((r.cur - r.prev) * 10) / 10 : null;
              const improving = delta != null && delta !== 0 && (GOOD_WHEN_DOWN.has(r.key) ? delta < 0 : delta > 0);
              const label = r.key === 'bodyweight' ? t('gt.bodyweight') : t(`measure.parts.${r.key}`, { defaultValue: r.key });
              const unit = r.key === 'bodyweight' ? t('common.kg') : 'cm';
              return (
                <div key={r.key} className="flex items-center justify-between px-5 py-4">
                  <span className="font-display text-[15px] font-medium">{label}</span>
                  <div className="flex items-center gap-3">
                    {delta != null && delta !== 0 && (
                      <span className={`font-mono text-[12px] ${improving ? 'text-success' : 'text-earth-subtle'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                      </span>
                    )}
                    <span className="font-mono text-[15px] font-medium">
                      {r.cur}<span className="ml-0.5 text-[11px] text-earth-muted">{unit}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'photos' && <ProgressPhotosBody />}

      <Sheet open={weightOpen} onClose={() => setWeightOpen(false)} title={t('home.logWeightTitle')}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.weight')} ({t('common.kg')})</label>
            <input
              className="input"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={weightVal}
              onChange={(e) => setWeightVal(e.target.value)}
            />
          </div>
          <button type="button" onClick={() => void saveWeight()} className="btn-primary btn-lg w-full">
            {t('common.save')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
