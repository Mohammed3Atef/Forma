import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTabParam } from "@/components/ui/Tabs";
import { useQuery } from "@tanstack/react-query";
import { useCardio } from "@/stores/cardioStore";
import { useWorkout } from "@/stores/workoutStore";
import { useMeasurements } from "@/stores/measurementStore";
import { useSettings } from "@/stores/settingsStore";
import { useSession } from "@/services/auth/sessionStore";
import { cloudAvailable } from "@/data/dataSource";
import { fetchMyAssessment } from "@/services/platform/clientCoachApi";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { TopBar } from "@/components/TopBar";
import { StatTile } from "@/components/StatTile";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { showToast } from "@/stores/toastStore";
import { BarChart, LineChart } from "@/components/charts";
import {
  logVolume,
  logSetCount,
  prByExercise,
  exerciseTrend,
  weeklyVolumeTrend,
} from "@/lib/calc";
import { muscleColor, muscleLabel } from "@/lib/muscle";
import {
  parseDecimal,
  shortDate,
  today,
  weekStartOf,
  addDays,
} from "@/lib/utils";
import { ProgressPhotosBody } from "@/pages/ProgressPhotos";

// Matches the prototype's 4-tab Progress screen exactly (Weight / Strength / Measure / Photos).
type Tab = "weight" | "strength" | "measure" | "photos";

// Measurement parts where a decrease is the improvement.
const GOOD_WHEN_DOWN = new Set(["waist", "abdomen", "bodyweight", "hips"]);

// Weight-chart period control — the full weight-log history is already
// loaded client-side (see `useCardio`), so filtering it by a selected
// window is free; no backend range param needed.
const WEIGHT_RANGES = ["7d", "30d", "3m", "6m", "1y", "all"] as const;
type WeightRange = (typeof WEIGHT_RANGES)[number];
const WEIGHT_RANGE_DAYS: Record<WeightRange, number | null> = { "7d": 7, "30d": 30, "3m": 90, "6m": 180, "1y": 365, all: null };

export function Progress() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const weightLogs = useCardio((s) => s.weightLogs);
  const logWeight = useCardio((s) => s.logWeight);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const measureLogs = useMeasurements((s) => s.logs);
  const profileWeight = useSettings((s) => s.profile?.weightKg);
  // URL-synced (replace, like every other tab bar in the app) so navigating
  // into Measurements/History/Photos and back — via a real back-navigation,
  // not a fresh mount — restores the same tab instead of resetting to Weight.
  const [tab, setTab] = useTabParam("tab", "weight");
  // Same URL-synced pattern as the main tab bar — shareable/back-friendly.
  const [weightRangeRaw, setWeightRange] = useTabParam("wr", "30d");
  const weightRange = (WEIGHT_RANGES as readonly string[]).includes(weightRangeRaw) ? (weightRangeRaw as WeightRange) : "30d";

  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);

  // Chart-only weight series for the selected period — `body.current`/
  // `body.monthDelta` below stay computed from the FULL history (unaffected
  // KPIs); only the chart + its insight sentence reflect the period picker.
  const weightChart = useMemo(() => {
    const days = WEIGHT_RANGE_DAYS[weightRange];
    const cutoff = days == null ? null : addDays(today(), -days);
    const points = (cutoff == null ? weightLogs : weightLogs.filter((w) => w.date >= cutoff)).map((w) => ({ date: w.date, value: w.weightKg }));
    const delta = points.length >= 2 ? Math.round((points[points.length - 1].value - points[0].value) * 10) / 10 : null;
    return { points, delta };
  }, [weightLogs, weightRange]);

  const overview = useMemo(() => {
    // Shared with Home.tsx's "Volume trend" — see `weeklyVolumeTrend`'s doc comment.
    const buckets = weeklyVolumeTrend(finished, weekStartOf);
    const totalVol = finished.reduce((v, l) => v + logVolume(l), 0);
    const totalSets = finished.reduce((n, l) => n + logSetCount(l), 0);
    const durations = finished.filter((l) => l.durationSec > 0);
    const avgDur = durations.length
      ? Math.round(
          durations.reduce((s, l) => s + l.durationSec, 0) /
            durations.length /
            60,
        )
      : 0;

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
    const muscles = Array.from(byMuscle.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const maxMuscle = muscles[0]?.[1] ?? 1;

    return {
      trend: buckets.map((b, i) => ({
        label: i === buckets.length - 1 ? t("gt.now") : `-${buckets.length - 1 - i}w`,
        value: b.value,
        date: b.weekStart,
      })),
      // Full-window first vs. last bucket (real zeros included), matching
      // what "over the last 8 weeks" actually means — was previously
      // filtering to non-zero buckets first, which could silently compare
      // two non-adjacent weeks while implying the whole window.
      volumeDelta: (buckets[buckets.length - 1].value - buckets[0].value) / 1000,
      hasAnyVolume: buckets.some((b) => b.value > 0),
      totalVol,
      totalSets,
      avgDur,
      workouts: finished.length,
      muscles,
      maxMuscle,
    };
  }, [finished, plan, t]);

  const records = useMemo(() => {
    const prs = Array.from(prByExercise(logs).values()).sort(
      (a, b) => b.e1rm - a.e1rm,
    );
    return prs;
  }, [logs]);

  const body = useMemo(() => {
    const series = weightLogs.map((w) => w.weightKg);
    const current = series.length ? series[series.length - 1] : null;

    // Change over the last ~30 days: the latest entry on/before that cutoff
    // (falls back to the oldest entry we have, so a client with only 3 weeks
    // of history still gets a real, if shorter, delta rather than nothing).
    const cutoff = addDays(today(), -30);
    const monthAgo =
      [...weightLogs].reverse().find((w) => w.date <= cutoff) ?? weightLogs[0];
    const monthDelta =
      current != null &&
      monthAgo &&
      monthAgo !== weightLogs[weightLogs.length - 1]
        ? Math.round((current - monthAgo.weightKg) * 10) / 10
        : null;

    // Latest + previous value for each measurement key, plus bodyweight.
    const keyVals = (
      key: string,
    ): { cur: number; prev: number | null } | null => {
      if (key === "bodyweight") {
        if (!weightLogs.length) return null;
        const cur = weightLogs[weightLogs.length - 1].weightKg;
        const prev =
          weightLogs.length > 1
            ? weightLogs[weightLogs.length - 2].weightKg
            : null;
        return { cur, prev };
      }
      const withKey = measureLogs.filter(
        (l) => typeof l.values[key] === "number",
      );
      if (!withKey.length) return null;
      const cur = withKey[withKey.length - 1].values[key];
      const prev =
        withKey.length > 1 ? withKey[withKey.length - 2].values[key] : null;
      return { cur, prev };
    };

    const latestKeys = measureLogs.length
      ? Object.keys(measureLogs[measureLogs.length - 1].values)
      : [];
    const rows = ["bodyweight", ...latestKeys]
      .map((key) => ({ key, ...(keyVals(key) ?? { cur: NaN, prev: null }) }))
      .filter((r) => !Number.isNaN(r.cur));

    return { series, current, rows, monthDelta };
  }, [weightLogs, measureLogs]);

  // Real target weight, when the client set one during their assessment —
  // never fabricated; the "to goal" stat simply doesn't render without it.
  const uid = useSession((s) => s.uid) ?? "";
  const assessmentEnabled = cloudAvailable() && !!uid && uid !== "local-user";
  const assessment = useQuery({
    queryKey: ["assessment", uid],
    queryFn: () => fetchMyAssessment(uid),
    enabled: assessmentEnabled,
  });
  const targetWeightKg = assessment.data?.goals?.targetWeightKg;
  const toGoal =
    targetWeightKg && body.current != null
      ? Math.round((body.current - targetWeightKg) * 10) / 10
      : null;

  // Log today's bodyweight from the Body tab.
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightVal, setWeightVal] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightError, setWeightError] = useState(false);
  const openWeight = () => {
    // `|| undefined` also skips an unset (0) profile weight.
    const seed = body.current ?? (profileWeight || undefined);
    setWeightVal(seed != null ? String(seed) : "");
    setWeightError(false);
    setWeightOpen(true);
  };
  const saveWeight = async () => {
    const n = parseDecimal(weightVal); // accepts "93.5", "93,5", Arabic digits
    if (!(n > 0)) return;
    setWeightSaving(true);
    setWeightError(false);
    try {
      await logWeight(n, today());
      setWeightOpen(false);
      showToast({ title: t('common.saved'), variant: 'success' });
    } catch {
      setWeightError(true);
    } finally {
      setWeightSaving(false);
    }
  };

  return (
    <div className="anim-rise">
      <TopBar
        title={t("progress.title")}
        eyebrow={t("gt.yourNumbers")}
        right={
          <button
            type="button"
            onClick={() => navigate("/history")}
            className="icon-btn h-11 w-11"
            aria-label={t("gt.history")}
          >
            <Icon name="calendar" size={18} />
          </button>
        }
      />

      <div className="seg mb-4">
        {(["weight", "strength", "measure", "photos"] as Tab[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={tab === s ? "on" : ""}
          >
            {t(`gt.${s}`)}
          </button>
        ))}
      </div>

      {tab === "weight" && (
        <div className="space-y-3">
          <div className="card-featured">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="eyebrow">{t("gt.bodyweight")}</span>
              <span className="font-display text-2xl font-bold">
                {body.current ?? (profileWeight || "–")}
                <span className="ml-1 text-sm font-normal text-earth-muted">
                  {t("common.kg")}
                </span>
              </span>
            </div>
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {WEIGHT_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  data-testid={`weight-range-${r}`}
                  onClick={() => setWeightRange(r)}
                  className={`chip ${weightRange === r ? "chip-on" : ""}`}
                >
                  {t(`gt.range.${r}`)}
                </button>
              ))}
            </div>
            {weightChart.delta != null && (
              <p className="mb-3 text-sm text-earth">
                {weightChart.delta === 0
                  ? t("gt.weightHolding")
                  : t(weightChart.delta < 0 ? "gt.weightDown" : "gt.weightUp", {
                      n: Math.abs(weightChart.delta),
                    })}
              </p>
            )}
            <LineChart
              data={weightChart.points}
              unit={t("common.kg")}
              emptyLabel={t("progress.noData")}
              locale={i18n.language}
            />
            <button
              type="button"
              onClick={openWeight}
              className="btn-ghost mt-3 w-full"
            >
              <Icon name="plus" size={15} /> {t("home.quick.addWeight")}
            </button>
          </div>

          {(body.current != null || toGoal != null) && (
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon="scale"
                value={body.current ?? "–"}
                unit={t("common.kg")}
                label={t("gt.current")}
                delta={
                  body.monthDelta != null && body.monthDelta !== 0
                    ? {
                        value: `${Math.abs(body.monthDelta)}${t("common.kg")} ${t("gt.thisMonth")}`,
                        dir: body.monthDelta < 0 ? "down" : "up",
                      }
                    : undefined
                }
              />
              {toGoal != null && (
                <StatTile
                  icon="target"
                  value={Math.abs(toGoal)}
                  unit={t("common.kg")}
                  label={t("gt.toGoalLabel")}
                />
              )}
            </div>
          )}
        </div>
      )}

      {tab === "strength" && (
        <div className="space-y-3">
          {records.length > 0 &&
            (() => {
              const top = records[0];
              const topEx = plan?.exercises[top.exerciseId];
              const trend = exerciseTrend(logs, top.exerciseId, 8);
              const delta =
                trend.length >= 2
                  ? Math.round((trend[trend.length - 1].value - trend[0].value) * 10) / 10
                  : null;
              return (
                <div className="card-featured">
                  <p className="eyebrow mb-2">
                    {t("gt.estimated1rm", {
                      name: topEx?.name ?? top.exerciseId,
                    })}
                  </p>
                  {delta != null && (
                    <p className="mb-4 text-sm text-earth">
                      {t(
                        delta >= 0
                          ? "gt.strongestLiftUp"
                          : "gt.strongestLiftDown",
                        { n: Math.abs(delta), sessions: trend.length },
                      )}
                    </p>
                  )}
                  <LineChart
                    data={trend}
                    unit={t("common.kg")}
                    emptyLabel={t("progress.noData")}
                    locale={i18n.language}
                  />
                </div>
              );
            })()}
          <div className="card divide-y divide-line-soft p-0">
            {records.length === 0 && (
              <p className="py-8 text-center text-sm text-earth-muted">
                {t("gt.noRecords")}
              </p>
            )}
            {records.map((pr) => {
              const ex = plan?.exercises[pr.exerciseId];
              return (
                <button
                  key={pr.exerciseId}
                  type="button"
                  onClick={() => navigate(`/workout/exercise/${pr.exerciseId}`)}
                  className="rowline w-full text-start"
                >
                  <span
                    className="tk-ic"
                    style={{ color: muscleColor(ex?.targetMuscle) }}
                  >
                    <Icon name="trophy" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
                      {ex?.name ?? pr.exerciseId}
                    </p>
                    <p className="font-mono text-[11.5px] text-earth-muted">
                      {pr.kg}
                      {t("common.kg")} × {pr.reps} ·{" "}
                      {shortDate(pr.date, i18n.language)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-mono text-[22px] font-medium leading-none text-brand">
                      {pr.e1rm}
                      <span className="text-sm text-earth-muted">
                        {t("common.kg")}
                      </span>
                    </p>
                    <p className="stat-label mt-0.5">{t("gt.est1rm")}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Real extra analytics the prototype doesn't show — same visual system, own sub-section. */}
          <div className="card-featured">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="eyebrow">{t("gt.weeklyVolume")}</span>
              <span className="font-mono text-[11px] text-brand">
                {t("gt.last8weeks")}
              </span>
            </div>
            <p className="mb-3 text-sm text-earth">
              {overview.hasAnyVolume
                ? t(overview.volumeDelta >= 0 ? "gt.volumeTrendUp" : "gt.volumeTrendDown", {
                    t: Math.abs(overview.volumeDelta).toFixed(1),
                  })
                : t("gt.volumeTrendFlat")}
            </p>
            <BarChart
              data={overview.trend}
              format={(v) => `${Math.round(v / 1000)}t`}
              unit="t"
              locale={i18n.language}
              emptyLabel={t("progress.noData")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon="arrowUp"
              value={(overview.totalVol / 1000).toFixed(0)}
              unit="t"
              label={t("gt.totalVolume")}
            />
            <StatTile
              icon="dumbbell"
              value={overview.workouts}
              label={t("gt.workouts")}
            />
            <StatTile
              icon="timer"
              value={overview.avgDur}
              unit="m"
              label={t("gt.avgDuration")}
            />
            <StatTile
              icon="bolt"
              value={overview.totalSets}
              label={t("gt.totalSets")}
            />
          </div>
          {overview.muscles.length > 0 && (
            <>
              <div className="sec-head flex items-baseline justify-between">
                <h2 className="h2">{t("gt.muscleSplit")}</h2>
                {/* Unlike the volume/1RM charts above (capped to the last 8
                    weeks/sessions), this is a cumulative all-time count —
                    labelled explicitly so it doesn't read as the same window. */}
                <span className="font-mono text-[11px] text-brand">{t("gt.allTime")}</span>
              </div>
              <div className="card space-y-3">
                {overview.muscles.map(([muscle, count]) => (
                  <div key={muscle} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate font-display text-sm font-medium">
                      {muscleLabel(muscle, t)}
                    </span>
                    <div className="prog thin flex-1">
                      <span
                        style={{
                          width: `${(count / overview.maxMuscle) * 100}%`,
                          background: muscleColor(muscle),
                        }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-end font-mono text-[12px] text-earth-muted">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "measure" && (
        <div className="space-y-3">
          <div className="hdr rounded-t-xl2 border border-b-0 border-line bg-surface-card p-5 flex items-center justify-between">
            <p className="ui-label">{t("gt.measurements")}</p>
            <button
              type="button"
              className="btn-tonal btn-sm min-h-0 px-2.5"
              onClick={() => navigate("/progress/measurements")}
            >
              <Icon name="plus" size={13} /> {t("gt.log")}
            </button>
          </div>
          <div className="card -mt-3 divide-y divide-line-soft rounded-t-none p-0">
            {body.rows.length === 0 && (
              <p className="p-5 text-center text-sm text-earth-muted">
                {t("measure.empty")}
              </p>
            )}
            {body.rows.map((r) => {
              const delta =
                r.prev != null ? Math.round((r.cur - r.prev) * 10) / 10 : null;
              const improving =
                delta != null &&
                delta !== 0 &&
                (GOOD_WHEN_DOWN.has(r.key) ? delta < 0 : delta > 0);
              const label =
                r.key === "bodyweight"
                  ? t("gt.bodyweight")
                  : t(`measure.parts.${r.key}`, { defaultValue: r.key });
              const unit = r.key === "bodyweight" ? t("common.kg") : "cm";
              return (
                <div
                  key={r.key}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <span className="font-display text-[15px] font-medium">
                    {label}
                  </span>
                  <div className="flex items-center gap-3">
                    {delta != null && delta !== 0 && (
                      <span
                        className={`font-mono text-[12px] ${improving ? "text-success" : "text-earth-subtle"}`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                    <span className="font-mono text-[15px] font-medium">
                      {r.cur}
                      <span className="ml-0.5 text-[11px] text-earth-muted">
                        {unit}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "photos" && <ProgressPhotosBody />}

      <Sheet
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        title={t("home.logWeightTitle")}
      >
        <div className="space-y-3">
          <div>
            <label className="label">
              {t("settings.weight")} ({t("common.kg")})
            </label>
            <input
              className="input"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={weightVal}
              onChange={(e) => setWeightVal(e.target.value)}
            />
          </div>
          {weightError && (
            <p role="alert" className="text-sm text-danger">{t("common.savedFailed")}</p>
          )}
          <SubmitButton
            type="button"
            pending={weightSaving}
            onClick={() => void saveWeight()}
            size="lg"
            fullWidth
          >
            {t("common.save")}
          </SubmitButton>
        </div>
      </Sheet>
    </div>
  );
}
