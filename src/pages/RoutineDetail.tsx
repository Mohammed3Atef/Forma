import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkout, warmupCountOf } from "@/stores/workoutStore";
import { useSubscription } from "@/hooks/useSubscription";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { StatTile } from "@/components/StatTile";
import { EntityNotes } from "@/components/EntityNotes";
import { muscleColor, muscleLabel } from "@/lib/muscle";
import type { Exercise, WorkoutDay, WorkoutSection } from "@/types";

/** Build the display sections for a day: real sections, or a single fallback group. */
function displaySections(day: WorkoutDay): WorkoutSection[] {
  if (day.sections?.length) return day.sections.filter((s) => s.exerciseIds.length > 0);
  return [{ id: "all", title: "", kind: "normal", exerciseIds: day.exerciseIds }];
}

export function RoutineDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dayId } = useParams();
  const plan = useWorkout((s) => s.plan);
  const startSession = useWorkout((s) => s.startSession);
  const { readOnly, status } = useSubscription();

  const day = plan?.days.find((d) => d.id === dayId);
  if (!plan || !day) {
    return (
      <div className="pt-10 text-center">
        <p className="text-earth-muted">{t("progress.noData")}</p>
      </div>
    );
  }

  const totalSets = day.exerciseIds.reduce((n, id) => {
    const ex = plan.exercises[id];
    return n + (ex ? (ex.workingSets > 0 ? ex.workingSets + warmupCountOf(ex) : Math.max(1, warmupCountOf(ex))) : 0);
  }, 0);

  const sections = displaySections(day);
  const multi = (day.sections?.length ?? 0) > 0;

  const start = async () => {
    await startSession(day.id);
    navigate("/workout/session");
  };

  const renderExercise = (id: string) => {
    const ex: Exercise | undefined = plan.exercises[id];
    if (!ex) return null;
    const warm = warmupCountOf(ex);
    return (
      <div key={id}>
      <button
        type="button"
        onClick={() => navigate(`/workout/exercise/${id}`)}
        className="row w-full text-start"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{ex.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-earth-muted">
            <span>{muscleLabel(ex.targetMuscle, t)}</span>
            {warm > 0 && (
              <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">
                {warm} {t("workout.warmup")}
              </span>
            )}
            {ex.workingSets > 0 && (
              <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">
                {ex.workingSets} {t("workout.working")} × {ex.repRange && ex.repRange !== "-" ? ex.repRange : "—"}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Icon name="timer" size={11} /> {t("workout.rest")} {ex.restSec}s
            </span>
            {ex.videoUrl && <Icon name="video" size={12} className="text-brand" />}
          </p>
          {ex.notes?.en && <p className="mt-1 line-clamp-2 text-[12px] text-earth-subtle">{ex.notes.en}</p>}
        </div>
        <Icon name="chevron" size={16} className="text-earth-subtle" />
      </button>
        <EntityNotes screen="workout" entityType="exercise" entityId={id} />
      </div>
    );
  };

  return (
    <div className="anim-rise pb-28">
      <TopBar title={day.title} eyebrow={day.focus} onBack={() => navigate("/workout")} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="list" value={day.exerciseIds.length} label={t("gt.exercises")} />
        <StatTile icon="bolt" value={totalSets} label={t("common.sets")} />
      </div>

      <div className="mt-4 space-y-5">
        {sections.map((section) => (
          <div key={section.id}>
            {multi && (
              <div className="mb-1 flex items-center gap-2 px-1">
                <h2 className="font-display text-sm font-semibold tracking-[-0.01em]">
                  {section.title || t(`coachEditor.sectionKinds.${section.kind}`)}
                </h2>
                {section.kind !== "normal" && (
                  <span className="rounded-full border border-line bg-surface-raised px-2 py-0.5 font-mono text-[10px] uppercase text-earth-subtle">
                    {t(`coachEditor.sectionKinds.${section.kind}`)}
                  </span>
                )}
              </div>
            )}
            <div>{section.exerciseIds.map(renderExercise)}</div>
          </div>
        ))}
        <EntityNotes screen="workout" entityType="workout_day" entityId={day.id} />
      </div>

      {/* Fixed start button with gradient fade */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md bg-gradient-to-t from-black from-60% to-transparent px-5 pb-[75px] pt-8">
        <button type="button" onClick={() => void start()} disabled={readOnly} className="btn-primary w-full disabled:opacity-40">
          <Icon name="play" size={15} /> {readOnly ? t(`subscription.status.${status}`) : t("gt.startThisWorkout")}
        </button>
      </div>
    </div>
  );
}
