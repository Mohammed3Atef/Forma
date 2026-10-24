import { exerciseDisplayName } from '@/lib/catalogText';
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkout, warmupCountOf } from "@/stores/workoutStore";
import { useSubscription } from "@/hooks/useSubscription";
import { Icon } from "@/components/Icon";
import { EntityNotes } from "@/components/EntityNotes";
import { TrainingGuideSheet } from "@/components/TrainingGuideSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/ListRow";
import { useLocalized } from "@/hooks/useLocalized";
import { muscleLabel } from "@/lib/muscle";
import { isPlayableVideoUrl } from "@/lib/videoSource";
import { formatDuration } from "@/lib/format";
import type { Exercise, WorkoutDay, WorkoutSection } from "@/types";
import { daySets } from "./Workout";

/** The day's real sections, or one plain group. */
function displaySections(day: WorkoutDay): WorkoutSection[] {
  if (day.sections?.length) return day.sections.filter((s) => s.exerciseIds.length > 0);
  return [{ id: "all", title: "", kind: "normal", exerciseIds: day.exerciseIds }];
}

/*
 * TRAIN › DAY (B2.3): the one way into a training day (CL-13 — it used to be
 * an orphan reachable only from notifications). Sections, every exercise with
 * its prescription, the coach's guidance where it applies (CL-14), a media
 * indicator only when something can play, and Start in the thumb zone.
 */
export function RoutineDetail() {
  const { t, i18n } = useTranslation();
  const loc = useLocalized(); // Arabic clients see the coach's Arabic notes (B1.8)
  const navigate = useNavigate();
  const { dayId } = useParams();
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const active = useWorkout((s) => s.active);
  const startSession = useWorkout((s) => s.startSession);
  const beginTimer = useWorkout((s) => s.beginTimer);
  const { readOnly } = useSubscription();
  const [guideOpen, setGuideOpen] = useState(false);

  const day = plan?.days.find((d) => d.id === dayId);
  if (!plan || !day) {
    return (
      <EmptyState
        icon="dumbbell"
        title={t("routineDetail.notFoundTitle")}
        message={t("routineDetail.notFoundMessage")}
        action={
          <Button variant="secondary" onClick={() => navigate("/workout")}>
            {t("session.backToTrain")}
          </Button>
        }
      />
    );
  }

  const running = active && active.startedAt && !active.finished ? active : logs.find((l) => l.startedAt && !l.finished) ?? null;
  const sections = displaySections(day);
  const multi = (day.sections?.length ?? 0) > 0;

  const start = async () => {
    if (readOnly) return;
    if (running) return navigate("/workout/session");
    await startSession(day.id);
    beginTimer();
    navigate("/workout/session");
  };

  const renderExercise = (id: string) => {
    const ex: Exercise | undefined = plan.exercises[id];
    if (!ex) return null;
    const warm = warmupCountOf(ex);
    const notes = ex.notes ? loc(ex.notes) : "";
    const reps = ex.repRange && ex.repRange !== "-" ? ex.repRange : "—";
    const presc = [
      warm > 0 ? t("train.warmupSets", { count: warm }) : null,
      ex.workingSets > 0 ? `${ex.workingSets} × ${reps}` : null,
      ex.restSec ? t("session.rest", { time: formatDuration(ex.restSec) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div key={id}>
        <button
          type="button"
          onClick={() => navigate(`/workout/exercise/${id}`)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]"
          data-testid={`day-exercise-${id}`}
        >
          {ex.imageUrl ? (
            <img src={ex.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-ui-control bg-white/[0.06] object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-ui-control bg-white/[0.06] text-earth-muted" aria-hidden="true">
              <Icon name="dumbbell" size={20} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold leading-snug">{exerciseDisplayName(ex, i18n.language)}</span>
            <span className="mt-0.5 block text-[13px] text-earth-muted">
              {muscleLabel(ex.targetMuscle, t)} · {presc}
              {isPlayableVideoUrl(ex.videoUrl) && (
                <span className="ms-1.5 inline-flex items-center gap-1 align-middle text-brand-hover">
                  · <Icon name="play" size={12} /> {t("train.video")}
                </span>
              )}
            </span>
            {notes && <span className="mt-1.5 line-clamp-2 block border-s-2 border-brand/50 ps-2 text-[13px] leading-snug text-earth">{notes}</span>}
          </span>
          <Icon name="chevron" size={18} className="shrink-0 text-earth-subtle" />
        </button>
        <div className="px-4 pb-3 ps-[4.75rem] empty:hidden">
          <EntityNotes screen="workout" entityType="exercise" entityId={id} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="routine-day">
      <header>
        <p className="text-[13px] font-medium text-brand-hover">{t("today.dayOf", { n: day.dayIndex + 1, total: plan.days.length })}</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em]">{day.title}</h1>
        {day.focus ? <p className="mt-1 text-[15px] text-earth-muted">{day.focus}</p> : null}
        <p className="mt-2 text-[14px] tabular-nums text-earth-muted">
          {t("today.exercises", { count: day.exerciseIds.filter((id) => plan.exercises[id]).length })} · {t("today.sets", { count: daySets(day, plan) })}
        </p>
      </header>

      <EntityNotes screen="workout" entityType="workout_day" entityId={day.id} />

      {sections.map((section) => (
        <section key={section.id}>
          {multi && (
            <h2 className="mb-2 text-[16px] font-semibold">
              {section.title || t(`coachEditor.sectionKinds.${section.kind}`)}
              {section.title && section.kind !== "normal" ? <span className="ms-2 text-[13px] font-normal text-earth-muted">{t(`coachEditor.sectionKinds.${section.kind}`)}</span> : null}
            </h2>
          )}
          <ListGroup>{section.exerciseIds.map(renderExercise)}</ListGroup>
        </section>
      ))}

      <button type="button" onClick={() => setGuideOpen(true)} className="hit-44 flex items-center gap-2 text-[14px] font-medium text-earth-muted hover:text-earth">
        <Icon name="info" size={18} /> {t("guide.title")}
      </button>

      {/* Start in the thumb zone, above the tab bar. While a workout runs, the
          shell's resume bar owns that spot (one resume control, not two). */}
      <div aria-hidden="true" className="h-20" />
      {!running && (
      <div className="fixed inset-x-0 z-ui-sticky bottom-[calc(var(--shell-bottom-clearance)+0.5rem)] px-4 lg:bottom-6 lg:start-60">
        <div className="mx-auto max-w-xl">
          {readOnly ? (
            <p className="rounded-ui-control border border-white/[0.1] bg-surface-raised px-4 py-3 text-[14px] text-earth-muted shadow-ui-sticky" role="status">
              {t("today.readOnly")}
            </p>
          ) : (
            <Button size="lg" icon="play" className="w-full shadow-ui-sticky" onClick={() => void start()}>
              {t("gt.startThisWorkout")}
            </Button>
          )}
        </div>
      </div>
      )}

      <TrainingGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
