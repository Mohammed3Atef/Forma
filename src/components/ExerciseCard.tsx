import { useState } from "react";
import { NumericField } from "@/components/ui/NumericField";
import { useTranslation } from "react-i18next";
import type { Exercise, ExerciseLog, SetLog } from "@/types";
import type { PrevPerf } from "@/stores/workoutStore";
import { Icon } from "./Icon";
import { useLocalized } from "@/hooks/useLocalized";
import { muscleColor, muscleLabel } from "@/lib/muscle";

interface ExerciseCardProps {
  exercise: Exercise;
  log: ExerciseLog;
  prev: PrevPerf | null;
  onUpdateSet: (setIndex: number, patch: Partial<SetLog>) => void;
  /** Returns false when the set can't be ticked yet (no reps to log). */
  onToggleDone: (setIndex: number) => boolean | void;
  onAddSet: () => void;
  onRemoveSet: (setIndex: number) => void;
  /** Omitted when there is no playable video — the button is then not shown (B0 / CL-20). */
  onVideo?: () => void;
  onRemoveExercise?: () => void;
}

const GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_2.5rem] items-center gap-2";

export function ExerciseCard({
  exercise,
  log,
  prev,
  onUpdateSet,
  onToggleDone,
  onAddSet,
  onRemoveSet,
  onVideo,
  onRemoveExercise,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [showNotes, setShowNotes] = useState(false);
  // Row whose ✓ was refused because there was nothing to log (CL-17).
  const [needsReps, setNeedsReps] = useState<number | null>(null);

  const dot = muscleColor(exercise.targetMuscle);
  const sub = [
    muscleLabel(exercise.targetMuscle, t),
    exercise.repRange && exercise.repRange !== "-" ? exercise.repRange : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ⓘ only when there is something behind it (CL-20).
  const hasNotes = !!loc(exercise.notes) || (!!exercise.tempo && exercise.tempo !== "-");

  let workingSeen = 0;
  const cell =
    "h-11 w-full rounded-[10px] border border-line bg-surface-raised text-center font-mono text-[15px] font-medium text-white placeholder:text-earth-subtle focus:border-brand/60 focus:outline-none";

  return (
    <section className="card !p-0 overflow-hidden">
      {/* Header: muscle dot + name + sub, video + remove */}
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: dot }}
          />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold tracking-[-0.01em]">
              {exercise.name}
            </p>
            <p className="truncate font-mono text-[11.5px] text-earth-muted">
              {sub}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasNotes && (
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="icon-btn h-8 w-8"
              aria-label={t("workout.notes")}
            >
              <Icon name="info" size={15} />
            </button>
          )}
          {onVideo && (
            <button
              type="button"
              onClick={onVideo}
              className="icon-btn h-8 w-8"
              aria-label={t("workout.watchVideo")}
              data-testid="exercise-video-button"
            >
              <Icon name="video" size={15} />
            </button>
          )}
          {onRemoveExercise && (
            <button
              type="button"
              onClick={onRemoveExercise}
              className="icon-btn h-8 w-8"
              aria-label={t("common.delete")}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      </header>

      {showNotes && hasNotes && (
          <div className="mx-4 mb-3 rounded-xl border border-line bg-surface-raised p-3 text-sm text-earth-muted">
            {loc(exercise.notes)}
            {exercise.tempo && exercise.tempo !== "-" && (
              <p className="mt-1 font-mono text-[11px] text-earth-subtle">
                {t("workout.tempo")} {exercise.tempo}
              </p>
            )}
          </div>
        )}

      <div className="px-4 pb-4">
        {/* Column headers */}
        <div className={`${GRID} px-1 pb-1`}>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-earth-subtle">
            {t("workout.set")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-earth-subtle">
            {t("gt.prev")}
          </span>
          <span className="text-center font-mono text-[10px] uppercase tracking-[0.08em] text-earth-subtle">
            {t("gt.kgCol")}
          </span>
          <span className="text-center font-mono text-[10px] uppercase tracking-[0.08em] text-earth-subtle">
            {t("gt.repsCol")}
          </span>
          <span />
        </div>

        <ul className="space-y-1">
          {log.sets.map((set) => {
            const prevSet = prev?.sets[set.setIndex];
            const prevLabel =
              prevSet &&
              (prevSet.weightKg != null || prevSet.actualReps != null)
                ? `${prevSet.weightKg ?? "–"}×${prevSet.actualReps ?? "–"}`
                : "—";
            const isWarm = set.type === "warmup";
            const label = isWarm ? "W" : String((workingSeen += 1));
            return (
              <li
                key={set.setIndex}
                className={`${GRID} rounded-xl px-1 py-1.5 ${set.done ? "bg-success/15" : isWarm ? "border-s-2 border-warn/60 bg-warn/10" : ""}`}
              >
                <span
                  className={`font-mono text-sm font-medium ml-[4px] ${set.done ? "text-brand" : isWarm ? "text-warn" : "text-earth-muted"}`}
                  aria-label={isWarm ? t("workout.warmup") : undefined}
                >
                  {label}
                </span>
                <span className="truncate font-mono text-[11.5px] text-earth-subtle">
                  {prevLabel}
                </span>
                <NumericField
                  ariaLabel={t("workout.weight")}
                  inputClassName={cell}
                  value={set.weightKg}
                  placeholder={
                    prevSet?.weightKg != null ? String(prevSet.weightKg) : "0"
                  }
                  onChange={(n) => onUpdateSet(set.setIndex, { weightKg: n })}
                />
                <NumericField
                  ariaLabel={t("common.reps")}
                  testId={`set-reps-${set.setIndex}`}
                  error={needsReps === set.setIndex}
                  inputClassName={`${cell}${needsReps === set.setIndex ? " !border-warn" : ""}`}
                  value={set.actualReps}
                  placeholder={
                    prevSet?.actualReps != null
                      ? String(prevSet.actualReps)
                      : set.targetReps || "0"
                  }
                  onChange={(n) => {
                    if (n != null && needsReps === set.setIndex) setNeedsReps(null);
                    onUpdateSet(set.setIndex, { actualReps: n });
                  }}
                />
                <button
                  type="button"
                  data-testid={`set-done-${set.setIndex}`}
                  onClick={() => setNeedsReps(onToggleDone(set.setIndex) === false ? set.setIndex : null)}
                  className={`flex h-10 w-10 items-center justify-center rounded-[10px] border transition-transform active:scale-90 ${
                    set.done
                      ? "border-success bg-success text-[#06210f]"
                      : "border-line bg-surface-raised text-earth-subtle"
                  }`}
                  aria-label={t("common.done")}
                >
                  <Icon name="check" size={18} />
                </button>
                {needsReps === set.setIndex && (
                  <p className="col-span-5 px-1 text-[12px] text-warn" role="alert" data-testid="set-needs-reps">
                    {t("trust.workout.enterReps")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onAddSet}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-line font-mono text-[11px] uppercase tracking-[0.04em] text-earth-muted transition-colors hover:text-white"
          >
            <Icon name="plus" size={14} /> {t("gt.addSet")}
          </button>
          {log.sets.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onRemoveSet(log.sets[log.sets.length - 1].setIndex)
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-earth-muted transition-colors hover:text-white"
              aria-label={t("workout.removeSet")}
            >
              <Icon name="minus" size={16} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
