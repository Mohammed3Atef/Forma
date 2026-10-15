import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { NumericField } from '@/components/ui/NumericField';
import { SegmentedControl, useTabParam } from '@/components/ui/Tabs';
import { useCardio } from '@/stores/cardioStore';
import { useWorkout } from '@/stores/workoutStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { Sheet } from '@/components/Sheet';
import { Button, LinkButton } from '@/components/ui/Button';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { showToast } from '@/stores/toastStore';
import { BarChart, LineChart } from '@/components/charts';
import { logVolume, prByExercise, exerciseTrend, weeklyVolumeTrend } from '@/lib/calc';
import { muscleLabel } from '@/lib/muscle';
import { addDays, dayKey, today, weekStartOf, weekdayInitials } from '@/lib/utils';
import { formatDate, formatNumber } from '@/lib/format';
import { ProgressPhotosBody } from '@/pages/ProgressPhotos';

/*
 * PROGRESS (B2.5, doc 16): "Am I getting there?"
 *   Body — the weight trend (the screen's one headline number), one log flow
 *          (weight, with measurements one tap further), measurements, photos.
 *   Strength — the top lift's estimated 1RM, personal records, weekly volume,
 *          muscle split. (The four all-time tiles are retired — doc 02.)
 *   Consistency — sessions against the coach's plan, week by week (CL-11:
 *          the goal is the plan's days, never an invented number or streak).
 * Old links keep working: ?tab=weight|measure|photos open Body (photos scrolls
 * to the photos), ?tab=strength opens Strength.
 */

type View = 'body' | 'strength' | 'consistency';
const VIEW_OF: Record<string, View> = { body: 'body', weight: 'body', measure: 'body', photos: 'body', strength: 'strength', consistency: 'consistency' };

// Measurement parts where a decrease is the improvement.
const GOOD_WHEN_DOWN = new Set(['waist', 'abdomen', 'hips']);

// Weight-chart period control — the full weight history is already loaded.
const WEIGHT_RANGES = ['7d', '30d', '3m', '6m', '1y', 'all'] as const;
type WeightRange = (typeof WEIGHT_RANGES)[number];
const WEIGHT_RANGE_DAYS: Record<WeightRange, number | null> = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365, all: null };

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Personal records shown before "Show all". */
const RECORDS_SHOWN = 8;

export function Progress() {
  const { t } = useTranslation();
  const [tabRaw, setTab] = useTabParam('tab', 'body');
  const view: View = VIEW_OF[tabRaw] ?? 'body';

  // A link to the old Photos tab lands on Body, scrolled to the photos.
  useEffect(() => {
    if (tabRaw !== 'photos') return;
    const id = window.setTimeout(() => document.getElementById('progress-photos')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(id);
  }, [tabRaw]);

  return (
    <div className="space-y-7" data-testid="client-progress">
      <SegmentedControl<View>
        className="seg-quiet"
        label={t('progress.views')}
        value={view}
        onChange={(v) => setTab(v)}
        testIdPrefix="progress-view"
        options={[
          { value: 'body', label: t('gt.body') },
          { value: 'strength', label: t('gt.strength') },
          { value: 'consistency', label: t('progress.consistency') },
        ]}
      />
      {view === 'body' && <BodyView />}
      {view === 'strength' && <StrengthView />}
      {view === 'consistency' && <ConsistencyView />}
    </div>
  );
}

/* ───────────────────────────── Body ───────────────────────────── */

function BodyView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const weightLogs = useCardio((s) => s.weightLogs);
  const logWeight = useCardio((s) => s.logWeight);
  const measureLogs = useMeasurements((s) => s.logs);
  const loadMeasurements = useMeasurements((s) => s.load);
  const measurementsLoaded = useMeasurements((s) => s.loaded);
  const profileWeight = useSettings((s) => s.profile?.weightKg);
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);
  const [rangeRaw, setRange] = useTabParam('wr', '30d');
  const range = (WEIGHT_RANGES as readonly string[]).includes(rangeRaw) ? (rangeRaw as WeightRange) : '30d';

  useEffect(() => {
    if (!measurementsLoaded) void loadMeasurements();
  }, [measurementsLoaded, loadMeasurements]);

  const current = weightLogs.length ? weightLogs[weightLogs.length - 1].weightKg : null;

  const chart = useMemo(() => {
    const days = WEIGHT_RANGE_DAYS[range];
    const cutoff = days == null ? null : addDays(today(), -days);
    const points = (cutoff == null ? weightLogs : weightLogs.filter((w) => w.date >= cutoff)).map((w) => ({ date: w.date, value: w.weightKg }));
    const delta = points.length >= 2 ? round1(points[points.length - 1].value - points[0].value) : null;
    return { points, delta };
  }, [weightLogs, range]);

  // A real target weight only when the client set one in their assessment.
  const uid = useSession((s) => s.uid) ?? '';
  const assessment = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: !!uid });
  const targetWeightKg = assessment.data?.goals?.targetWeightKg;
  const toGoal = targetWeightKg && current != null ? round1(current - targetWeightKg) : null;

  // Latest value + change for each measured part.
  const labelOf = (key: string) => t(`measure.parts.${key}`, { defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key });
  const rows = useMemo(() => {
    const latestKeys = measureLogs.length ? Object.keys(measureLogs[measureLogs.length - 1].values) : [];
    return latestKeys
      .map((key) => {
        const withKey = measureLogs.filter((l) => typeof l.values[key] === 'number');
        if (!withKey.length) return null;
        const cur = withKey[withKey.length - 1].values[key];
        const prev = withKey.length > 1 ? withKey[withKey.length - 2].values[key] : null;
        return { key, cur, delta: prev != null ? round1(cur - prev) : null };
      })
      .filter((r): r is { key: string; cur: number; delta: number | null } => r != null);
  }, [measureLogs]);
  const lastMeasured = measureLogs.length ? measureLogs[measureLogs.length - 1].date : null;

  // The one log flow: today's weight, with measurements one tap further.
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const openLog = () => {
    setWeight(current ?? (profileWeight || null));
    setError(false);
    setOpen(true);
  };
  const save = async () => {
    if (weight == null || !(weight > 0)) return;
    setSaving(true);
    setError(false);
    try {
      await logWeight(weight, today());
      setOpen(false);
      showToast({ title: t('common.saved'), variant: 'success' });
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-7 lg:grid-cols-2 lg:items-start lg:gap-6">
      <section
        className="relative overflow-hidden rounded-[20px] border border-white/[0.1] bg-gradient-surface-hi p-5 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-[''] md:p-6"
        data-testid="progress-weight"
      >
        <div className="relative z-[1]">
          <p className="text-[13px] font-medium text-brand-hover">{t('gt.weight')}</p>
          {current != null ? (
            <p className="mt-1 font-mono text-[40px] font-semibold leading-none tabular-nums">
              <span dir="ltr">{formatNumber(current, lang, { maxFractionDigits: 1 })}</span>
              <span className="ms-1.5 font-sans text-[16px] font-normal text-earth-muted">{t('common.kg')}</span>
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-earth-muted">{t('progress.noWeighIns')}</p>
          )}
          {(chart.delta != null || toGoal != null) && (
            <p className="mt-2 text-[14px] text-earth-muted" data-testid="progress-weight-change">
              {[
                chart.delta == null ? null : chart.delta === 0 ? t('progress.rangeSteady') : t(chart.delta < 0 ? 'progress.rangeDown' : 'progress.rangeUp', { n: formatNumber(Math.abs(chart.delta), lang) }),
                toGoal != null ? (toGoal === 0 ? t('progress.atGoal') : t('progress.toGoal', { n: formatNumber(Math.abs(toGoal), lang) })) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label={t('progress.period')}>
            {WEIGHT_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                data-testid={`weight-range-${r}`}
                onClick={() => setRange(r)}
                className={`min-h-9 shrink-0 rounded-ui-pill px-3 text-[13px] font-semibold tabular-nums transition-colors hit-44 ${range === r ? 'bg-white/[0.12] text-earth' : 'text-earth-muted hover:text-earth'}`}
              >
                {t(`gt.range.${r}`)}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <LineChart data={chart.points} unit={t('common.kg')} emptyLabel={t('progress.noData')} locale={lang} />
          </div>
          <Button icon="plus" className="mt-5 w-full" onClick={openLog} data-testid="progress-log-weight">
            {t('progress.logWeight')}
          </Button>
        </div>
      </section>

      <Section
        title={t('gt.measurements')}
        testId="progress-measurements"
        action={
          rows.length > 0 ? (
            <LinkButton to="/progress/measurements" variant="ghost" size="sm">
              {t('progress.update')}
            </LinkButton>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <ListGroup>
            <ListRow to="/progress/measurements" leading={<IconTile icon="scale" tone="neutral" />} title={t('progress.addMeasurements')} meta={t('progress.addMeasurementsMeta')} chevron />
          </ListGroup>
        ) : (
          <>
            {lastMeasured && <p className="mb-2 text-[13px] text-earth-muted">{t('progress.lastMeasured', { date: formatDate(lastMeasured, lang, 'short') })}</p>}
            <ListGroup>
              {rows.map((r) => {
                const improving = r.delta != null && r.delta !== 0 && (GOOD_WHEN_DOWN.has(r.key) ? r.delta < 0 : r.delta > 0);
                return (
                  <div key={r.key} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                    <span className="truncate text-[15px]">{labelOf(r.key)}</span>
                    <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                      {r.delta != null && r.delta !== 0 && (
                        <span className={`text-[13px] ${improving ? 'text-success' : 'text-earth-muted'}`} dir="ltr">
                          {r.delta > 0 ? '+' : '−'}
                          {formatNumber(Math.abs(r.delta), lang)}
                        </span>
                      )}
                      <span className="text-[15px] font-semibold" dir="ltr">
                        {formatNumber(r.cur, lang)}
                        <span className="ms-0.5 text-[12px] font-normal text-earth-muted">cm</span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </ListGroup>
          </>
        )}
      </Section>

      <section id="progress-photos" className="scroll-mt-20 lg:col-span-2" data-testid="progress-photos">
        <h2 className="mb-2 text-[17px] font-semibold leading-tight">{t('progress.photos')}</h2>
        <ProgressPhotosBody />
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('progress.logWeightTitle')}>
        <div className="space-y-4">
          <NumericField label={`${t('settings.weight')} (${t('common.kg')})`} suffix={t('common.kg')} value={weight} onChange={setWeight} />
          <p className="text-[13px] text-earth-muted">{t('progress.savedForToday')}</p>
          {error && (
            <p role="alert" className="text-[14px] text-warn">
              {t('common.savedFailed')}
            </p>
          )}
          <Button size="lg" className="w-full" pending={saving} disabled={weight == null || !(weight > 0)} onClick={() => void save()}>
            {t('common.save')}
          </Button>
          <ListGroup>
            <ListRow
              onClick={() => {
                setOpen(false);
                navigate('/progress/measurements');
              }}
              leading={<IconTile icon="scale" tone="neutral" />}
              title={t('progress.addMeasurements')}
              meta={t('progress.addMeasurementsMeta')}
              chevron
            />
          </ListGroup>
        </div>
      </Sheet>
    </div>
  );
}

/* ─────────────────────────── Strength ─────────────────────────── */

function StrengthView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);
  const records = useMemo(() => Array.from(prByExercise(logs).values()).sort((a, b) => b.e1rm - a.e1rm), [logs]);
  const [showAll, setShowAll] = useState(false);

  const top = records[0];
  const topTrend = useMemo(() => (top ? exerciseTrend(logs, top.exerciseId, 8) : []), [logs, top]);
  const topDelta = topTrend.length >= 2 ? round1(topTrend[topTrend.length - 1].value - topTrend[0].value) : null;

  const volume = useMemo(() => {
    const buckets = weeklyVolumeTrend(finished, weekStartOf);
    return {
      bars: buckets.map((b, i) => ({ label: i === buckets.length - 1 ? t('gt.now') : `-${buckets.length - 1 - i}w`, value: b.value, date: b.weekStart })),
      delta: (buckets[buckets.length - 1].value - buckets[0].value) / 1000,
      any: buckets.some((b) => b.value > 0),
    };
  }, [finished, t]);
  const totalVol = useMemo(() => finished.reduce((v, l) => v + logVolume(l), 0), [finished]);

  const muscles = useMemo(() => {
    const by = new Map<string, number>();
    finished.forEach((l) =>
      l.exercises.forEach((ex) => {
        const m = plan?.exercises[ex.exerciseId]?.targetMuscle;
        const done = ex.sets.filter((s) => s.done).length;
        if (m && done) by.set(m, (by.get(m) ?? 0) + done);
      }),
    );
    const list = Array.from(by.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { list, max: list[0]?.[1] ?? 1 };
  }, [finished, plan]);

  if (!finished.length) {
    return (
      <ListGroup>
        <ListRow to="/workout" leading={<IconTile icon="dumbbell" tone="neutral" />} title={t('progress.strengthEmptyTitle')} meta={t('gt.noRecords')} chevron />
      </ListGroup>
    );
  }

  const topName = top ? plan?.exercises[top.exerciseId]?.name ?? top.exerciseId : '';
  return (
    <div className="grid gap-7 lg:grid-cols-2 lg:items-start lg:gap-6">
      {top && (
        <section className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-5" data-testid="progress-top-lift">
          <p className="text-[13px] font-medium text-brand-hover">{t('progress.topLift')}</p>
          <h2 className="mt-1 text-[19px] font-semibold leading-tight">{topName}</h2>
          <p className="mt-2 font-mono text-[32px] font-semibold leading-none tabular-nums">
            <span dir="ltr">{formatNumber(top.e1rm, lang)}</span>
            <span className="ms-1.5 font-sans text-[15px] font-normal text-earth-muted">{t('common.kg')}</span>
            <span className="ms-2 font-sans text-[13px] font-normal text-earth-muted">{t('gt.est1rm')}</span>
          </p>
          {topDelta != null && (
            <p className="mt-2 text-[14px] text-earth">
              {t(topDelta >= 0 ? 'gt.trend1rmUp' : 'gt.trend1rmDown', { n: Math.abs(topDelta), sessions: topTrend.length })}
            </p>
          )}
          <div className="mt-3">
            <LineChart data={topTrend} unit={t('common.kg')} emptyLabel={t('progress.noData')} locale={lang} />
          </div>
        </section>
      )}

      <Section title={t('gt.personalRecords')} testId="progress-records">
        <ListGroup>
          {(showAll ? records : records.slice(0, RECORDS_SHOWN)).map((pr) => {
            const ex = plan?.exercises[pr.exerciseId];
            return (
              <ListRow
                key={pr.exerciseId}
                to={`/workout/exercise/${pr.exerciseId}`}
                title={ex?.name ?? pr.exerciseId}
                meta={
                  <span>
                    <span dir="ltr">
                      {formatNumber(pr.kg, lang)} {t('common.kg')} × {formatNumber(pr.reps, lang)}
                    </span>{' '}
                    · {formatDate(pr.date, lang, 'short')}
                  </span>
                }
                trailing={
                  <span className="text-end">
                    <span className="block text-[16px] font-semibold tabular-nums" dir="ltr">
                      {formatNumber(pr.e1rm, lang)}
                      <span className="ms-0.5 text-[12px] font-normal text-earth-muted">{t('common.kg')}</span>
                    </span>
                    <span className="block text-[12px] text-earth-muted">{t('gt.est1rm')}</span>
                  </span>
                }
                chevron
              />
            );
          })}
        </ListGroup>
        {records.length > RECORDS_SHOWN && (
          <Button variant="ghost" className="mt-2 w-full" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('progress.showFewer') : t('progress.showAllRecords', { count: records.length })}
          </Button>
        )}
      </Section>

      <Section title={t('gt.weeklyVolume')} action={<span className="text-[13px] text-earth-muted">{t('gt.last8weeks')}</span>}>
        <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
          <p className="mb-3 text-[14px] text-earth">
            {volume.any ? t(volume.delta >= 0 ? 'gt.volumeTrendUp' : 'gt.volumeTrendDown', { t: Math.abs(volume.delta).toFixed(1) }) : t('gt.volumeTrendFlat')}
          </p>
          <BarChart data={volume.bars} format={(v) => `${Math.round(v / 1000)}t`} locale={lang} emptyLabel={t('progress.noData')} />
          <p className="mt-3 text-[13px] text-earth-muted">
            {t('progress.allTimeVolume', { t: formatNumber(Math.round(totalVol / 1000), lang), count: finished.length })}
          </p>
        </div>
      </Section>

      {muscles.list.length > 0 && (
        <Section title={t('gt.muscleSplit')} action={<span className="text-[13px] text-earth-muted">{t('progress.setsAllTime')}</span>}>
          <div className="space-y-3 rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
            {muscles.list.map(([m, count]) => (
              <div key={m} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-[14px]">{muscleLabel(m, t)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-info/80" style={{ width: `${(count / muscles.max) * 100}%` }} />
                </span>
                <span className="w-8 shrink-0 text-end text-[13px] tabular-nums text-earth-muted">{formatNumber(count, lang)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ───────────────────────── Consistency ───────────────────────── */

const WEEKS = 8;


function ConsistencyView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const planDays = plan?.days.length ?? 0;
  const todayKey = today();

  const weeks = useMemo(() => {
    const finishedDates = logs.filter((l) => l.finished).map((l) => l.date);
    const trained = new Set(finishedDates);
    const thisWeek = dayKey(weekStartOf(new Date()));
    // Weeks before the first session are not "missed" — they come before the client started.
    const first = finishedDates.length ? finishedDates.reduce((m, d) => (d < m ? d : m)) : thisWeek;
    const firstWeek = dayKey(weekStartOf(new Date(`${first}T12:00:00`)));
    const since = Math.round((new Date(`${thisWeek}T12:00:00`).getTime() - new Date(`${firstWeek}T12:00:00`).getTime()) / (7 * 86_400_000)) + 1;
    const shown = Math.max(1, Math.min(WEEKS, since));
    return Array.from({ length: shown }, (_, i) => {
      const start = addDays(thisWeek, -7 * (shown - 1 - i));
      const days = Array.from({ length: 7 }, (_, d) => addDays(start, d));
      const count = days.filter((d) => trained.has(d)).length;
      return { start, days: days.map((d) => ({ d, trained: trained.has(d), future: d > todayKey })), count };
    });
  }, [logs, todayKey]);

  const thisWeek = weeks[weeks.length - 1];
  const pastWeeks = weeks.slice(0, -1);
  const completeWeeks = planDays > 0 ? pastWeeks.filter((w) => w.count >= planDays).length : 0;
  const initials = weekdayInitials(lang);

  return (
    <div className="grid gap-7 lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-5" data-testid="progress-this-week">
        <p className="text-[13px] font-medium text-brand-hover">{t('gt.thisWeek')}</p>
        {planDays > 0 ? (
          <>
            <p className="mt-1 text-[22px] font-semibold leading-tight">{t('progress.weekSessions', { done: formatNumber(thisWeek.count, lang), total: formatNumber(planDays, lang) })}</p>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {Array.from({ length: planDays }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < thisWeek.count ? 'bg-success' : 'bg-white/10'}`} />
              ))}
            </div>
            <p className="mt-3 text-[14px] text-earth-muted">
              {thisWeek.count >= planDays ? t('progress.weekDone') : t('progress.weekLeft', { count: planDays - thisWeek.count })}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-earth-muted">{t('progress.noPlanGoal', { count: thisWeek.count })}</p>
        )}
      </section>

      <Section title={t('progress.lastWeeks', { count: weeks.length })} testId="progress-weeks" className="lg:row-span-2">
        {planDays > 0 && pastWeeks.length > 0 && <p className="mb-3 text-[14px] text-earth">{t('progress.weeksComplete', { done: formatNumber(completeWeeks, lang), count: pastWeeks.length })}</p>}
        <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
          <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))_2.5rem] items-center gap-1.5">
            <span />
            {initials.map((d, i) => (
              <span key={i} className="text-center text-[12px] font-medium text-earth-subtle">
                {d}
              </span>
            ))}
            <span />
            {weeks
              .slice()
              .reverse()
              .map((w) => {
                const full = planDays > 0 && w.count >= planDays;
                return (
                  <div key={w.start} className="contents" role="group" aria-label={t('progress.weekOf', { date: formatDate(w.start, lang, 'short'), count: w.count })}>
                    <span className="truncate text-[12px] tabular-nums text-earth-muted">{formatDate(w.start, lang, 'short')}</span>
                    {w.days.map((c) => (
                      <span
                        key={c.d}
                        className={`mx-auto h-6 w-full max-w-8 rounded-[6px] ${c.trained ? 'bg-success/80' : c.future ? 'border border-dashed border-white/[0.08]' : 'bg-white/[0.05]'} ${c.d === todayKey ? 'ring-1 ring-brand/70' : ''}`}
                        aria-hidden="true"
                      />
                    ))}
                    <span className={`text-end text-[13px] font-semibold tabular-nums ${full ? 'text-success' : 'text-earth-muted'}`} dir="ltr">
                      {planDays > 0 ? `${w.count}/${planDays}` : w.count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </Section>

      <ListGroup>
        <ListRow to="/history" leading={<IconTile icon="calendar" tone="neutral" />} title={t('train.historyTitle')} meta={t('progress.historyMeta')} chevron />
      </ListGroup>
    </div>
  );
}
