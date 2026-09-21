import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients, listClientDashboardSummaries } from '@/services/platform/coachApi';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { AssessmentStatus } from '@/types';

const TONE: Record<AssessmentStatus, PillTone> = {
  not_started: 'mute',
  in_progress: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
  updated_after_review: 'brand',
};
// Submitted / re-submitted assessments float to the top — they need review.
const PRIORITY: Record<AssessmentStatus, number> = {
  submitted: 0,
  updated_after_review: 1,
  in_progress: 2,
  not_started: 3,
  reviewed: 4,
};

/** Aggregate list of every client's assessment status; links into the review screen. */
export function CoachAssessments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);

  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });
  const list = clients.data ?? [];
  // One batched summary request for every client's assessment status, instead
  // of one `assessment.get` request per client — see `dashboardSummaries`'
  // doc comment (also shared by the coach dashboard and `CoachAdherence`).
  const summaries = useQuery({
    queryKey: ['coachDashboardSummaries', coachId],
    queryFn: () => listClientDashboardSummaries(coachId!),
    enabled: !!coachId,
  });

  const rows = useMemo(() => {
    const byClient = new Map((summaries.data ?? []).map((s) => [s.clientId, s]));
    return list
      .map((client) => ({ client, status: byClient.get(client.id)?.assessment ?? 'not_started' }))
      .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
  }, [list, summaries.data]);

  return (
    <div className="anim-rise" data-testid="coach-assessments">
      <TopBar title={t('coachDash.reviewAssessments')} eyebrow={t('platform.coachPortal')} />
      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : rows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coachDash.noClients')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {rows.map(({ client, status }) => (
            <button
              key={client.id}
              type="button"
              data-testid="assessment-row"
              onClick={() => navigate(`/coach/client/${client.id}/assessment`)}
              className="row w-full text-start"
            >
              <Avatar name={client.displayName || client.email} photoUrl={client.photoUrl} />
              <span className="min-w-0 flex-1 truncate font-medium">{client.displayName || client.email}</span>
              <Pill tone={TONE[status]}>{t(`assessment.status.${status}`)}</Pill>
              <Icon name="chevron" size={16} className="text-earth-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
