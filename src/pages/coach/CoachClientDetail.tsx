import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatTile } from "@/components/StatTile";
import { Sheet } from "@/components/Sheet";
import { TextAreaField } from "@/components/ui/Field";
import { useSession } from "@/services/auth/sessionStore";
import {
  addCoachNote,
  fetchClientLogs,
  getClientAssessment,
  listCoachNotes,
  type Author,
} from "@/services/platform/coachApi";
import {
  getClientCardioPlan,
  getClientMealPlan,
  getClientWorkoutPlan,
} from "@/services/platform/planApi";
import { fetchUser } from "@/services/platform/accountsApi";
import { releaseClient } from "@/services/platform/coachClientsApi";
import { assessmentStatus } from "@/lib/assessment";
import { Icon, type IconName } from "@/components/Icon";
import { Pill, type PillTone } from "@/components/ui/Pill";
import type { AssessmentStatus, WeightLog, WorkoutLog } from "@/types";

const ASSESS_TONE: Record<AssessmentStatus, PillTone> = {
  not_started: "mute",
  in_progress: "warn",
  submitted: "brand",
  reviewed: "ok",
  updated_after_review: "warn",
};

export function CoachClientDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = "" } = useParams();
  const account = useSession((s) => s.account);
  const author: Author = {
    id: account?.id ?? "self",
    role: account?.role ?? "coach",
  };

  const [sheet, setSheet] = useState<"note" | "manage" | "release" | null>(
    null,
  );
  const coachId = account?.id ?? "";

  const release = useMutation({
    mutationFn: () => releaseClient(coachId, clientId, coachId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["myClients", coachId] });
      void qc.invalidateQueries({ queryKey: ["coachDashboard", coachId] });
      void qc.invalidateQueries({ queryKey: ["coachDashboardSummaries", coachId] });
      setSheet(null);
      navigate("/coach");
    },
  });

  const user = useQuery({
    queryKey: ["user", clientId],
    queryFn: () => fetchUser(clientId),
    enabled: !!clientId,
  });
  const workouts = useQuery({
    // The limit is part of the key — `CoachAdherence.tsx` caches the SAME
    // conceptual query under `['clientLogs', id, 'workoutLogs']` but with a
    // different limit (30, for its rolling adherence window); without the
    // limit in the key, TanStack Query would treat them as one cache entry
    // and whichever page loaded first would silently truncate the other's
    // data for the life of that cache entry.
    queryKey: ["clientLogs", clientId, "workoutLogs", 10],
    queryFn: () => fetchClientLogs<WorkoutLog>(clientId, "workoutLogs", 10),
    enabled: !!clientId,
  });
  const weights = useQuery({
    queryKey: ["clientLogs", clientId, "weightLogs"],
    queryFn: () => fetchClientLogs<WeightLog>(clientId, "weightLogs", 1),
    enabled: !!clientId,
  });
  const notes = useQuery({
    queryKey: ["coachNotes", clientId],
    queryFn: () => listCoachNotes(clientId),
    enabled: !!clientId,
  });
  const workoutPlan = useQuery({
    queryKey: ["clientWorkoutPlan", clientId],
    queryFn: () => getClientWorkoutPlan(clientId),
    enabled: !!clientId,
  });
  const mealPlan = useQuery({
    queryKey: ["clientMealPlan", clientId],
    queryFn: () => getClientMealPlan(clientId),
    enabled: !!clientId,
  });
  const cardioPlan = useQuery({
    queryKey: ["clientCardioPlan", clientId],
    queryFn: () => getClientCardioPlan(clientId),
    enabled: !!clientId,
  });
  const assessment = useQuery({
    queryKey: ["clientAssessment", clientId],
    queryFn: () => getClientAssessment(clientId),
    enabled: !!clientId,
  });
  const assessStatus = assessmentStatus(assessment.data);

  const plansCount = (workoutPlan.data ? 1 : 0) + (mealPlan.data ? 1 : 0);
  const finishedWorkouts = (workouts.data ?? []).filter(
    (w) => w.finished,
  ).length;
  const lastWeight = weights.data?.[0]?.weightKg;

  return (
    <>
      <div className="w-full" data-testid="coach-client-detail">
        {user.data?.phone && (
          <a
            href={`tel:${user.data.phone}`}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-brand-light"
            dir="ltr"
          >
            <Icon name="info" size={14} /> {user.data.phone}
          </a>
        )}

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile
            icon="dumbbell"
            value={finishedWorkouts}
            label={t("coach.recentWorkouts")}
          />
          <StatTile
            icon="scale"
            value={lastWeight ?? "—"}
            unit={lastWeight ? t("common.kg") : undefined}
            label={t("coach.lastWeight")}
          />
          <StatTile
            icon="edit"
            value={notes.data?.length ?? 0}
            label={t("coach.notes")}
          />
          <StatTile icon="list" value={plansCount} label={t("coach.plans")} />
        </div>

        {/* Primary actions: view the client's activity, or manage their plan. */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            data-testid="coach-view-activity"
            onClick={() => navigate(`/coach/client/${clientId}/view`)}
            className="btn-primary"
          >
            {t("activity.view")}
          </button>
          <button
            type="button"
            data-testid="coach-manage"
            onClick={() => setSheet("manage")}
            className="btn-ghost"
          >
            {t("coach.manage")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3 mt-5">
          {/* Open the canonical 1:1 messenger thread with this client. */}
          <button
            type="button"
            data-testid="coach-message-client"
            onClick={() => navigate(`/coach/messages/${clientId}`)}
            className="card-tap mt-2.5 flex w-full items-center gap-3 text-start"
          >
            <span className="row-av bg-brand/15 text-brand">
              <Icon name="chat" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("coach.messages")}</span>
              <span className="block text-[13px] text-earth-muted">
                {t("messages.openThread")}
              </span>
            </span>
            <Icon name="chevron" size={18} className="rtl:rotate-180" />
          </button>

          {/* Client onboarding assessment (read-only) */}
          <button
            type="button"
            data-testid="coach-view-assessment"
            onClick={() => navigate(`/coach/client/${clientId}/assessment`)}
            className="card-tap mt-2.5 flex w-full items-center gap-3 text-start"
          >
            <span className="row-av bg-brand/15 text-brand">
              <Icon name="list" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("assessment.title")}</span>
              <span className="block text-[13px] text-earth-muted">
                {t("assessment.coachHint")}
              </span>
            </span>
            <Pill testId="assessment-status-badge" tone={ASSESS_TONE[assessStatus]}>
              {t(`assessment.status.${assessStatus}`)}
            </Pill>
            <Icon name="chevron" size={18} className="rtl:rotate-180" />
          </button>

          {/* Weekly check-ins */}
          <button
            type="button"
            data-testid="coach-view-checkins"
            onClick={() => navigate(`/coach/client/${clientId}/checkins`)}
            className="card-tap mt-2.5 flex w-full items-center gap-3 text-start"
          >
            <span className="row-av bg-brand/15 text-brand">
              <Icon name="calendar" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("checkin.title")}</span>
              <span className="block text-[13px] text-earth-muted">
                {t("checkin.coachHint")}
              </span>
            </span>
            <Icon name="chevron" size={18} className="rtl:rotate-180" />
          </button>
        </div>

        {/* Targets (read-only summary) — sourced from the nutrition plan, the single targets editor. */}
        <h2 className="h2 mb-2 mt-6">{t("coach.targets")}</h2>
        <div className="card">
          <div className="grid grid-cols-3 gap-3 text-center">
            <TargetCell
              label={t("nutrition.calories")}
              value={mealPlan.data?.targets.calories}
            />
            <TargetCell
              label={t("nutrition.protein")}
              value={mealPlan.data?.targets.protein}
              unit="g"
            />
            <TargetCell
              label={t("coach.water")}
              value={mealPlan.data?.waterTargetMl}
              unit="ml"
            />
          </div>
        </div>

        {/* Latest notes preview */}
        <h2 className="h2 mb-2 mt-6">{t("coach.notes")}</h2>
        <div className="card divide-y divide-line-soft">
          {notes.data?.length ? (
            notes.data.slice(0, 3).map((n) => (
              <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <span className="font-mono text-[10.5px] text-earth-subtle">
                  {new Date(n.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <p className="py-2 text-sm text-earth-muted">
              {t("coach.noNotes")}
            </p>
          )}
        </div>
      </div>

      <ManageSheet
        open={sheet === "manage"}
        onClose={() => setSheet(null)}
        workoutAssigned={!!workoutPlan.data}
        nutritionAssigned={!!mealPlan.data}
        cardioAssigned={!!cardioPlan.data}
        workoutName={workoutPlan.data?.name}
        nutritionName={mealPlan.data?.name}
        cardioCount={cardioPlan.data?.sessions.length ?? 0}
        onWorkout={() => navigate(`/coach/client/${clientId}/workout`)}
        onNutrition={() => navigate(`/coach/client/${clientId}/nutrition`)}
        onCardio={() => navigate(`/coach/client/${clientId}/cardio`)}
        onNote={() => setSheet("note")}
        onRelease={() => setSheet("release")}
      />
      <NoteSheet
        open={sheet === "note"}
        onClose={() => setSheet(null)}
        clientId={clientId}
        author={author}
        onSaved={() =>
          void qc.invalidateQueries({ queryKey: ["coachNotes", clientId] })
        }
      />

      <Sheet
        open={sheet === "release"}
        onClose={() => setSheet(null)}
        title={t("release.title")}
      >
        <p className="text-sm text-earth-muted">{t("release.body")}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            data-testid="release-confirm"
            disabled={release.isPending}
            onClick={() => release.mutate()}
            className="btn-primary w-full bg-danger disabled:opacity-40"
          >
            {release.isPending ? t("auth.working") : t("release.confirm")}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => setSheet(null)}
          >
            {t("common.cancel")}
          </button>
        </div>
      </Sheet>
    </>
  );
}

function TargetCell({
  label,
  value,
  unit,
}: {
  label: string;
  value?: number;
  unit?: string;
}) {
  return (
    <div>
      <div className="stat-num text-2xl">
        {value ?? "—"}
        {value != null && unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function NoteSheet({
  open,
  onClose,
  clientId,
  author,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  author: Author;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const mut = useMutation({
    mutationFn: () => addCoachNote(clientId, body.trim(), author),
    onSuccess: () => {
      setBody("");
      onSaved();
      onClose();
    },
  });
  return (
    <Sheet open={open} onClose={onClose} size="md" title={t("coach.addNote")}>
      <TextAreaField
        label={t("field.notes")}
        className="min-h-28"
        data-testid="coach-note-body"
        placeholder={t("coach.notePlaceholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="button"
        data-testid="coach-note-save"
        disabled={!body.trim() || mut.isPending}
        onClick={() => mut.mutate()}
        className="btn-primary mt-3 w-full disabled:opacity-40"
      >
        {t("common.save")}
      </button>
    </Sheet>
  );
}

function ManageSheet({
  open,
  onClose,
  workoutAssigned,
  nutritionAssigned,
  cardioAssigned,
  workoutName,
  nutritionName,
  cardioCount,
  onWorkout,
  onNutrition,
  onCardio,
  onNote,
  onRelease,
}: {
  open: boolean;
  onClose: () => void;
  workoutAssigned: boolean;
  nutritionAssigned: boolean;
  cardioAssigned: boolean;
  workoutName?: string;
  nutritionName?: string;
  cardioCount?: number;
  onWorkout: () => void;
  onNutrition: () => void;
  onCardio: () => void;
  onNote: () => void;
  onRelease: () => void;
}) {
  const { t } = useTranslation();
  // An assigned plan with a blank name still counts as assigned (don't fall
  // through to "no plan").
  const planSub = (assigned: boolean, name?: string) =>
    assigned ? name?.trim() || t("coach.planEdit") : t("coach.noPlanAssigned");
  const row = (
    icon: IconName,
    title: string,
    sub: string,
    onClick: () => void,
    testId?: string,
  ) => (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="row w-full text-start"
    >
      <span className="row-av bg-brand/15 text-brand">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-[13px] text-earth-muted">
          {sub}
        </span>
      </span>
      <Icon name="chevron" size={18} className="rtl:rotate-180" />
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title={t("coach.manage")}>
      <div className="card divide-y divide-line-soft">
        {row(
          "dumbbell",
          t("coach.kind.workout"),
          planSub(workoutAssigned, workoutName),
          onWorkout,
          "coach-edit-workout",
        )}
        {row(
          "meal",
          t("coach.kind.nutrition"),
          planSub(nutritionAssigned, nutritionName),
          onNutrition,
          "coach-edit-nutrition",
        )}
        {row(
          "activity",
          t("coach.kind.cardio"),
          cardioAssigned
            ? t("coach.sessionsCount", { n: cardioCount ?? 0 })
            : t("coach.noPlanAssigned"),
          onCardio,
          "coach-edit-cardio",
        )}
        {row(
          "edit",
          t("coach.addNote"),
          t("coach.notes"),
          onNote,
          "coach-add-note",
        )}
      </div>
      <button
        type="button"
        data-testid="coach-release-client"
        onClick={() => {
          onClose();
          onRelease();
        }}
        className="btn-ghost mt-3 w-full text-danger"
      >
        {t("release.action")}
      </button>
    </Sheet>
  );
}
