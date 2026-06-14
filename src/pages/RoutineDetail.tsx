import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkout } from "@/stores/workoutStore";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { StatTile } from "@/components/StatTile";
import { muscleColor, muscleLabel } from "@/lib/muscle";

export function RoutineDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dayId } = useParams();
  const plan = useWorkout((s) => s.plan);
  const startSession = useWorkout((s) => s.startSession);

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
    return n + (ex ? (ex.workingSets > 0 ? ex.workingSets + 1 : 1) : 0);
  }, 0);

  const start = async () => {
    await startSession(day.id);
    navigate("/workout/session");
  };

  return (
    <div className="anim-rise pb-28">
      <TopBar
        title={day.title}
        eyebrow={day.focus}
        onBack={() => navigate("/workout")}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon="list"
          value={day.exerciseIds.length}
          label={t("gt.exercises")}
        />
        <StatTile icon="bolt" value={totalSets} label={t("common.sets")} />
      </div>

      <div className="mt-4">
        {day.exerciseIds.map((id) => {
          const ex = plan.exercises[id];
          if (!ex) return null;
          const sets = ex.workingSets > 0 ? ex.workingSets : 1;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(`/workout/exercise/${id}`)}
              className="row w-full text-start"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: muscleColor(ex.targetMuscle) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
                  {ex.name}
                </p>
                <p className="font-mono text-[11.5px] text-earth-muted">
                  {muscleLabel(ex.targetMuscle, t)}
                </p>
              </div>
              <span className="font-mono text-[12px] text-earth-muted">
                {sets} ×{" "}
                {ex.repRange && ex.repRange !== "-"
                  ? ex.repRange
                  : ex.workingSets || "—"}
              </span>
              <Icon name="chevron" size={16} className="text-earth-subtle" />
            </button>
          );
        })}
      </div>

      {/* Fixed start button with gradient fade */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md bg-gradient-to-t from-black from-60% to-transparent px-5 pb-[75px] pt-8">
        <button
          type="button"
          onClick={() => void start()}
          className="btn-primary w-full"
        >
          <Icon name="play" size={15} /> {t("gt.startThisWorkout")}
        </button>
      </div>
    </div>
  );
}
