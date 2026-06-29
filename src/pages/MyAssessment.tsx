import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { AssessmentView } from "@/components/AssessmentView";
import { CoachInfoCard } from "@/components/CoachInfoCard";
import { AssessmentWizard } from "@/pages/onboarding/AssessmentWizard";
import { cloudAvailable } from "@/data/dataSource";
import { useSession } from "@/services/auth/sessionStore";
import { fetchMyAssessment } from "@/services/platform/clientCoachApi";
import { assessmentStatus } from "@/lib/assessment";
import type { AssessmentStatus } from "@/types";

const PILL: Record<AssessmentStatus, string> = {
  not_started: "border-line text-earth-subtle",
  in_progress: "border-warn/50 text-warn",
  submitted: "border-brand/50 text-brand",
  reviewed: "border-success/50 text-success",
  updated_after_review: "border-warn/50 text-warn",
};

/**
 * Client's own assessment: read-only answers + coach feedback + status/review
 * date, with an Edit action (living document — always editable; editing a
 * reviewed assessment flips it to 'updated_after_review').
 */
export function MyAssessment() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const uid = useSession((s) => s.uid) ?? "";
  const displayName = useSession((s) => s.account?.displayName) ?? "";
  const enabled = cloudAvailable() && !!uid && uid !== "local-user";
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ["assessment", uid],
    queryFn: () => fetchMyAssessment(uid),
    enabled,
  });
  const a = q.data ?? null;
  const status = assessmentStatus(a);

  if (editing && a) {
    return (
      <AssessmentWizard
        uid={uid}
        displayName={displayName}
        initial={a}
        onDone={() => {
          setEditing(false);
          void q.refetch();
        }}
      />
    );
  }

  return (
    <div className="anim-rise space-y-4">
      <TopBar
        title={t("assessment.title")}
        eyebrow={t("gt.profile")}
        onBack={() => navigate("/settings")}
        right={
          <span className={`chip ${PILL[status]}`}>
            {t(`assessment.status.${status}`)}
          </span>
        }
      />

      {q.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">
          {t("auth.working")}
        </p>
      ) : !a ? (
        <p className="py-8 text-center text-sm text-earth-muted">
          {t("assessment.notCompleted")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 ">
            <div className="card flex items-center justify-between text-[13px]">
              <span className="text-earth-muted">
                {t("assessment.lastUpdated")}
              </span>
              <span className="font-mono">
                {a.updatedAt
                  ? new Date(a.updatedAt).toLocaleDateString(i18n.language)
                  : "—"}
              </span>
            </div>
            {(status === "reviewed" || status === "updated_after_review") &&
              a.reviewedAt && (
                <div className="card flex items-center justify-between text-[13px]">
                  <span className="text-earth-muted">
                    {t("assessment.reviewedOn")}
                  </span>
                  <span className="font-mono">
                    {new Date(a.reviewedAt).toLocaleDateString(i18n.language)}
                  </span>
                </div>
              )}
          </div>
          {a.coachNotes?.trim() && (
            <div className="card border border-brand/30">
              <p className="label">{t("assessment.coachFeedback")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{a.coachNotes}</p>
            </div>
          )}

          <CoachInfoCard />

          <button
            type="button"
            data-testid="assessment-edit"
            className="btn-primary w-full"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={16} /> {t("assessment.editAssessment")}
          </button>

          <AssessmentView assessment={a} />
        </>
      )}
    </div>
  );
}
