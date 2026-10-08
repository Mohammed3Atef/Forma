import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { TextInput } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useGuardedNav } from "@/hooks/useGuardedNav";
import type { PlanVersionKind } from "@/types";

/**
 * Editor toolbar: "Save as new version" (a normal guarded save with a reason —
 * every save is versioned now, B0 / CO-01) and a link to the version history.
 * The save itself is owned by the editor so it uses the same concurrency check.
 */
export function VersionActions({
  clientId,
  kind,
  onSaveVersion,
  pending,
  error,
}: {
  clientId: string;
  kind: PlanVersionKind;
  onSaveVersion: (reason: string) => Promise<unknown>;
  pending: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useGuardedNav();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const submit = async () => {
    try {
      await onSaveVersion(reason.trim());
      setOpen(false);
      setReason("");
    } catch {
      /* the editor shows the error / conflict state */
    }
  };

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
          {error && <p className="text-sm text-danger">{error}</p>}
          <SubmitButton
            type="button"
            data-testid="version-save-confirm"
            fullWidth
            pending={pending}
            onClick={() => void submit()}
          >
            {t("planVersions.saveAsVersion")}
          </SubmitButton>
        </div>
      </Sheet>
    </div>
  );
}
