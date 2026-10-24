import { exerciseDisplayName } from '@/lib/catalogText';
import { useState } from "react";
import { NumericField } from "@/components/ui/NumericField";
import { useTranslation } from "react-i18next";
import type { Exercise, ExerciseLog, SetLog } from "@/types";
import type { PrevPerf } from "@/stores/workoutStore";
import { Icon } from "./Icon";
import { EntityNotes } from "./EntityNotes";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { useLocalized } from "@/hooks/useLocalized";
import { muscleColor, muscleLabel } from "@/lib/muscle";
import { formatDuration } from "@/lib/format";

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

/*
 * The one interactive card of the live session (B2.3, doc 17 "ExerciseCard"):
 * - name, prescription and the coach's guidance where it's needed (CL-14):
 *   the exercise's own notes inline + the coach's anchored notes;
 * - 56px set controls for sweaty, one-handed use (D5 / AX-01);
 * - previous values sit in their own column and as faint placeholders, so
 *   they never read as logged numbers; ticking an empty row commits exactly
 *   what is shown (B0 / CL-17 — the rule lives in workoutStore.toggleSetDone);
 * - video only when something can play (B0 / CL-20); remove-exercise lives in
 *   the overflow menu, never as a bare ✕ (VS-08).
 */
const GRID = "grid grid-cols-[2.25rem_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_3.5rem] items-center gap-2";

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
  const { t, i18n } = useTranslation();
  const name = exerciseDisplayName(exercise, i18n.language);
  const loc = useLocalized();
  // Row whose ✓ was refused because there was nothing to log (CL-17).
  const [needsReps, setNeedsReps] = useState<number | null>(null);

  const working = log.sets.filter((s) => s.type !== "warmup").length;
  const reps = exercise.repRange && exercise.repRange !== "-" ? exercise.repRange : null;
  const prescription = [
    muscleLabel(exercise.targetMuscle, t),
    reps ? `${working} × ${reps}` : null,
    exercise.rir ? t("session.rir", { n: exercise.rir }) : null,
    exercise.restSec ? t("session.rest", { time: formatDuration(exercise.restSec) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const notes = loc(exercise.notes);
  const tempo = exercise.tempo && exercise.tempo !== "-" ? exercise.tempo : null;

  let workingSeen = 0;
  const cell =
    "h-14 w-full rounded-ui-control border border-white/[0.12] bg-surface-raised text-center font-mono text-[17px] font-medium text-white placeholder:font-normal placeholder:text-earth-subtle/60 focus:border-brand focus:outline-none";

  return (
    <section className="space-y-4" data-testid="exercise-card">
      <header className="flex items-start gap-3">
        <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: muscleColor(exercise.targetMuscle) }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">{name}</h2>
          <p className="mt-1 text-[14px] leading-snug text-earth-muted">{prescription}</p>
        </div>
        {onRemoveExercise && (
          <ActionMenu
            label={t("session.exerciseOptions", { name })}
            items={[{ key: "remove", label: t("session.removeExercise"), icon: "trash", danger: true, onSelect: onRemoveExercise, testId: "remove-exercise" }]}
          />
        )}
      </header>

      {(onVideo || notes || tempo) && (
        <div className="space-y-3">
          {onVideo && (
            <button
              type="button"
              onClick={onVideo}
              aria-label={t("workout.watchVideo")}
              data-testid="exercise-video-button"
              className="flex min-h-12 w-full items-center gap-3 rounded-ui-control border border-white/[0.1] bg-white/[0.04] px-3 text-start text-[15px] font-medium transition-colors hover:bg-white/[0.07]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">
                <Icon name="play" size={16} />
              </span>
              {t("workout.watchVideo")}
            </button>
          )}
          {(notes || tempo) && (
            <div className="border-s-2 border-brand/50 ps-3 text-[15px] leading-relaxed text-earth">
              {notes ? <p>{notes}</p> : null}
              {tempo ? <p className="mt-1 text-[13px] text-earth-muted">{t("session.tempo", { tempo })}</p> : null}
            </div>
          )}
        </div>
      )}
      <EntityNotes entityType="exercise" entityId={exercise.id} screen="workout" />

      <div>
        <div className={`${GRID} px-1 pb-2`} aria-hidden="true">
          <span className="text-[12px] font-medium text-earth-subtle">{t("workout.set")}</span>
          <span className="text-[12px] font-medium text-earth-subtle">{t("gt.prev")}</span>
          <span className="text-center text-[12px] font-medium text-earth-subtle">{t("gt.kgCol")}</span>
          <span className="text-center text-[12px] font-medium text-earth-subtle">{t("gt.repsCol")}</span>
          <span />
        </div>

        <ul className="space-y-2">
          {log.sets.map((set) => {
            const prevSet = prev?.sets[set.setIndex];
            const prevLabel =
              prevSet && (prevSet.weightKg != null || prevSet.actualReps != null)
                ? `${prevSet.weightKg ?? "–"} × ${prevSet.actualReps ?? "–"}`
                : "—";
            const isWarm = set.type === "warmup";
            const label = isWarm ? "W" : String((workingSeen += 1));
            return (
              <li
                key={set.setIndex}
                data-testid="set-row"
                data-done={set.done || undefined}
                className={`${GRID} rounded-ui-control px-1 py-1 transition-colors duration-ui-base ${
                  set.done ? "bg-success/[0.14]" : isWarm ? "bg-warn/[0.07]" : ""
                }`}
              >
                <span
                  className={`text-center font-mono text-[15px] font-semibold ${set.done ? "text-success" : isWarm ? "text-warn" : "text-earth-muted"}`}
                  aria-label={isWarm ? t("workout.warmup") : undefined}
                >
                  {label}
                </span>
                <span className="truncate font-mono text-[13px] text-earth-subtle" dir="ltr">
                  {prevLabel}
                </span>
                <NumericField
                  ariaLabel={t("workout.weight")}
                  inputClassName={cell}
                  value={set.weightKg}
                  placeholder={prevSet?.weightKg != null ? String(prevSet.weightKg) : "0"}
                  onChange={(n) => onUpdateSet(set.setIndex, { weightKg: n })}
                />
                <NumericField
                  ariaLabel={t("common.reps")}
                  testId={`set-reps-${set.setIndex}`}
                  error={needsReps === set.setIndex}
                  inputClassName={`${cell}${needsReps === set.setIndex ? " !border-warn" : ""}`}
                  value={set.actualReps}
                  placeholder={prevSet?.actualReps != null ? String(prevSet.actualReps) : set.targetReps || "0"}
                  onChange={(n) => {
                    if (n != null && needsReps === set.setIndex) setNeedsReps(null);
                    onUpdateSet(set.setIndex, { actualReps: n });
                  }}
                />
                <button
                  type="button"
                  data-testid={`set-done-${set.setIndex}`}
                  aria-pressed={set.done}
                  onClick={() => setNeedsReps(onToggleDone(set.setIndex) === false ? set.setIndex : null)}
                  className={`flex h-14 w-14 items-center justify-center rounded-ui-control border-2 transition-transform duration-ui-fast active:scale-95 motion-reduce:transform-none ${
                    set.done ? "border-success bg-success text-[#06210f]" : "border-white/[0.16] text-earth-muted hover:border-white/30"
                  }`}
                  aria-label={t("common.done")}
                >
                  <Icon name="check" size={24} />
                </button>
                {needsReps === set.setIndex && (
                  <p className="col-span-5 px-1 text-[13px] text-warn" role="alert" data-testid="set-needs-reps">
                    {t("trust.workout.enterReps")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onAddSet}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-ui-control border border-dashed border-white/[0.16] text-[14px] font-medium text-earth-muted transition-colors hover:text-earth"
          >
            <Icon name="plus" size={16} /> {t("gt.addSet")}
          </button>
          {log.sets.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveSet(log.sets[log.sets.length - 1].setIndex)}
              className="flex h-12 w-12 items-center justify-center rounded-ui-control border border-white/[0.12] text-earth-muted transition-colors hover:text-earth"
              aria-label={t("workout.removeSet")}
            >
              <Icon name="minus" size={18} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
