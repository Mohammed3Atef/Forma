import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { TextInput } from "@/components/ui/Field";
import { saveAsNewVersion } from "@/services/platform/planVersionsApi";
import type {
  CardioPlan,
  MealPlan,
  PlanVersionKind,
  WorkoutPlan,
} from "@/types";

const PLAN_QUERY_KEY: Record<PlanVersionKind, string> = {
  workout: "clientWorkoutPlan",
  nutrition: "clientMealPlan",
  cardio: "clientCardioPlan",
};

/**
 * Editor toolbar: "Save as new version" (snapshots the current plan + mirrors it
 * into the assigned plan) and a link to the version history. The plain primary
 * Save button in each editor remains "save current plan" (overwrite, no version).
 */
export function VersionActions({
  clientId,
  kind,
  plan,
  createdBy,
}: {
  clientId: string;
  kind: PlanVersionKind;
  plan: WorkoutPlan | MealPlan | CardioPlan;
  createdBy: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () => saveAsNewVersion(clientId, kind, plan, createdBy, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["planVersions", clientId, kind] });
      void qc.invalidateQueries({ queryKey: [PLAN_QUERY_KEY[kind], clientId] });
      setOpen(false);
      navigate(`/coach/client/${clientId}`);
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="version-save-new"
        className="chip flex gap-2 items-center"
        onClick={() => setOpen(true)}
      >
        <Icon name="download" size={14} /> {t("planVersions.saveAsVersion")}
      </button>
      <button
        type="button"
        data-testid="version-history"
        className="chip flex gap-2 items-center"
        onClick={() => navigate(`/coach/client/${clientId}/versions/${kind}`)}
      >
        <Icon name="list" size={14} /> {t("planVersions.history")}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={t("planVersions.saveAsVersion")}
      >
        <div className="space-y-3">
          <p className="text-[13px] text-earth-muted">
            {t("planVersions.saveAsVersionHint")}
          </p>
          <TextInput
            label={t("field.reason")}
            data-testid="version-reason"
            placeholder={t("planVersions.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {save.isError && (
            <p className="text-sm text-danger">
              {(save.error as Error)?.message}
            </p>
          )}
          <button
            type="button"
            data-testid="version-save-confirm"
            className="btn-primary w-full disabled:opacity-40"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {t("planVersions.saveAsVersion")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
