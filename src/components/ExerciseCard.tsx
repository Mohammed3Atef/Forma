import { useEffect, useState } from "react";
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
  onToggleDone: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setIndex: number) => void;
  onVideo: () => void;
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

  const dot = muscleColor(exercise.targetMuscle);
  const sub = [
    muscleLabel(exercise.targetMuscle, t),
    exercise.repRange && exercise.repRange !== "-" ? exercise.repRange : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="icon-btn h-8 w-8"
            aria-label={t("workout.notes")}
          >
            <Icon name="info" size={15} />
          </button>
          <button
            type="button"
            onClick={onVideo}
            className="icon-btn h-8 w-8"
            aria-label={t("workout.watchVideo")}
          >
            <Icon name="video" size={15} />
          </button>
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

      {showNotes &&
        (loc(exercise.notes) || (exercise.tempo && exercise.tempo !== "-")) && (
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
                <NumericCell
                  ariaLabel={t("workout.weight")}
                  value={set.weightKg}
                  placeholder={
                    prevSet?.weightKg != null ? String(prevSet.weightKg) : "0"
                  }
                  onChange={(n) => onUpdateSet(set.setIndex, { weightKg: n })}
                  className={cell}
                />
                <NumericCell
                  ariaLabel={t("common.reps")}
                  value={set.actualReps}
                  placeholder={
                    prevSet?.actualReps != null
                      ? String(prevSet.actualReps)
                      : set.targetReps || "0"
                  }
                  onChange={(n) => onUpdateSet(set.setIndex, { actualReps: n })}
                  className={cell}
                />
                <button
                  type="button"
                  onClick={() => onToggleDone(set.setIndex)}
                  className={`flex h-10 w-10 items-center justify-center rounded-[10px] border transition-transform active:scale-90 ${
                    set.done
                      ? "border-success bg-success text-white"
                      : "border-line bg-surface-raised text-earth-subtle"
                  }`}
                  aria-label={t("common.done")}
                >
                  <Icon name="check" size={18} />
                </button>
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

interface NumericCellProps {
  value: number | null;
  placeholder?: string;
  ariaLabel: string;
  className: string;
  onChange: (n: number | null) => void;
}

/**
 * Number entry that tolerates decimals. A plain controlled number input eats the
 * decimal point ("12." → Number → 12 → re-render strips the dot), so we hold the
 * raw text while focused and only sync from the model when the field is idle.
 */
function NumericCell({ value, placeholder, ariaLabel, className, onChange }: NumericCellProps) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [focused, setFocused] = useState(false);

  // Reflect external changes (undo, restore, set add) only when not mid-edit.
  useEffect(() => {
    if (!focused) setText(value == null ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(",", "."); // accept comma as decimal sep
        if (!/^\d*\.?\d*$/.test(raw)) return; // digits + at most one dot
        setText(raw);
        const parsed = raw === "" || raw === "." ? null : Number(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className={className}
    />
  );
}
