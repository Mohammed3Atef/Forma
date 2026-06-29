import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { cloudAvailable } from "@/data/dataSource";
import { useSession } from "@/services/auth/sessionStore";
import { fetchMyCoach } from "@/services/platform/clientCoachApi";

/**
 * "Your Coach" card: avatar + name + phone + a Message button. `compact` renders
 * a single tappable row (Home); the full variant is for Profile / assessment.
 * Renders nothing until the client has an assigned coach.
 */
export function CoachInfoCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const enabled = cloudAvailable() && !!coachId;
  const q = useQuery({
    queryKey: ["myCoach", coachId],
    queryFn: () => fetchMyCoach(coachId!),
    enabled,
  });
  const coach = q.data;
  if (!coach) return null;

  if (compact) {
    return (
      <button
        type="button"
        data-testid="coach-info-compact"
        onClick={() => navigate("/messages")}
        className="card-tap flex w-full items-center gap-3 text-start"
      >
        <Avatar
          name={coach.displayName}
          photoUrl={coach.photoUrl}
          size="sm"
          rounded="rounded-full"
        />
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-brand">
            {t("coachInfo.yourCoach")}
          </span>
          <span className="block truncate font-medium">
            {coach.displayName || coach.email}
          </span>
        </span>
        <Icon name="info" size={18} className="text-earth-subtle" />
      </button>
    );
  }

  return (
    <section data-testid="coach-info">
      <h2 className="h2 mb-2">{t("coachInfo.yourCoach")}</h2>
      <div className="card flex items-center gap-3">
        <Avatar
          name={coach.displayName}
          photoUrl={coach.photoUrl}
          size="md"
          rounded="rounded-full"
        />
        <div className="min-w-0 flex-1 flex flex-col items-start gap-0.5">
          <p className="truncate font-medium">
            {coach.displayName || coach.email}
          </p>
          {coach.phone && (
            <a
              href={`tel:${coach.phone}`}
              className="block font-mono text-[12px] text-brand-light"
              dir="ltr"
            >
              {coach.phone}
            </a>
          )}
        </div>
        <button
          type="button"
          data-testid="coach-message"
          className="btn-ghost px-3"
          onClick={() => navigate("/messages")}
        >
          <Icon name="info" size={16} /> {t("coachInfo.message")}
        </button>
      </div>
    </section>
  );
}
