import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { Pill } from '@/components/ui/Pill';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useSession } from '@/services/auth/sessionStore';
import { listCoachNotes } from '@/services/platform/coachApi';
import { listClientCoachHistory } from '@/services/platform/coachClientsApi';
import { assessmentStatus } from '@/lib/assessment';
import { clientStateOf } from '@/lib/coachDirectory';
import { sectionPath, workspaceBase } from '@/lib/coachWorkspace';
import { formatDate } from '@/lib/format';
import { ASSESSMENT_TONE as ASSESS_TONE, CLIENT_STATE_TONE as STATE_TONE } from '@/lib/statusTone';


/**
 * Client › Profile (B3.4 / blueprint §6.3): the client's record with this coach — assessment,
 * notes (author-private by default, B3.0.1), package and billing, coaching history, contact.
 * Each opens its section at the URL it always had (`…/assessment`, `…/notes`, `…/subscription`,
 * `…/history` — stored notification targets), with a way back to Profile.
 */
export function WorkspaceProfile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useGuardedNav();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const header = useCoachClientHeader(clientId);
  const notes = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });
  const history = useQuery({ queryKey: ['coachHistoryRels', clientId], queryFn: () => listClientCoachHistory(clientId), enabled: !!clientId });
  const base = workspaceBase(clientId);
  const open = (seg: string) => navigate(`${base}/${seg}`, { replace: true });

  const status = assessmentStatus(header.assessment);
  const rel = header.relationship;
  const state = rel?.status === 'active' ? clientStateOf(rel, Date.now()) : null;
  const earlier = history.data ? history.data.filter((r) => r.coachId !== coachId).length + (history.data.find((r) => r.coachId === coachId)?.previousStints?.length ?? 0) : null;
  const tile = (icon: IconName) => <IconTile icon={icon} tone="neutral" />;

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="workspace-profile">
      <Section title={t('workspace.profile.record')}>
        <ListGroup>
          <ListRow
            testId="profile-assessment"
            leading={tile('list')}
            title={t('assessment.title')}
            meta={header.assessment?.submittedAt ? t('workspace.profile.submittedOn', { date: formatDate(header.assessment.submittedAt, lang, 'medium') }) : undefined}
            trailing={<Pill tone={ASSESS_TONE[status]}>{t(`assessment.status.${status}`)}</Pill>}
            chevron
            onClick={() => open('assessment')}
          />
          <ListRow
            testId="profile-notes"
            leading={tile('edit')}
            title={t('coach.notes')}
            meta={notes.isError ? '—' : notes.data ? t('workspace.profile.notesCount', { count: notes.data.length }) : '…'}
            chevron
            onClick={() => open('notes')}
          />
          <ListRow
            testId="profile-subscription"
            leading={tile('calendar')}
            title={t('workspace.profile.package')}
            meta={state && state.daysLeft != null ? t('coachClients.daysLeft', { count: state.daysLeft }) : undefined}
            trailing={state ? <Pill tone={STATE_TONE[state.state]}>{state.state === 'expiring' && state.daysLeft != null ? t('coachClients.endsIn', { count: state.daysLeft }) : t(`coachClients.state.${state.state}`)}</Pill> : null}
            chevron
            onClick={() => open('subscription')}
          />
          <ListRow
            testId="profile-history"
            leading={tile('rotate')}
            title={t('timeline.title')}
            meta={rel?.createdAt ? `${t('workspace.profile.withYouSince', { date: formatDate(rel.createdAt, lang, 'medium') })}${earlier ? ` · ${t('workspace.profile.earlierCoaches', { count: earlier })}` : ''}` : undefined}
            chevron
            onClick={() => open('history')}
          />
        </ListGroup>
      </Section>

      <Section title={t('workspace.profile.contact')}>
        <div className="card space-y-3" data-testid="profile-contact">
          {header.user?.phone ? (
            <a href={`tel:${header.user.phone}`} className="flex min-h-11 items-center gap-3 text-[15px] hover:text-brand-hover">
              <Icon name="phone" size={18} className="text-earth-subtle" />
              <bdi dir="ltr">{header.user.phone}</bdi>
            </a>
          ) : null}
          {header.user?.email ? (
            <a href={`mailto:${header.user.email}`} className="flex min-h-11 items-center gap-3 break-all text-[15px] hover:text-brand-hover">
              <Icon name="mail" size={18} className="text-earth-subtle" />
              <bdi dir="ltr">{header.user.email}</bdi>
            </a>
          ) : null}
          {!header.user?.phone && !header.user?.email ? <p className="text-[14px] text-earth-muted">—</p> : null}
        </div>
      </Section>
    </div>
  );
}

/** A Profile section at its own URL, with the way back to Profile (replace — the opener stays one Back away). */
export function ProfileSection({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useGuardedNav();
  const { clientId = '' } = useParams();
  return (
    <div className="space-y-3">
      <button type="button" className="chip inline-flex items-center gap-1" data-testid="profile-back" onClick={() => navigate(sectionPath(clientId, 'profile'), { replace: true })}>
        <Icon name="chevronLeft" size={14} /> {t('workspace.section.profile')}
      </button>
      {children}
    </div>
  );
}
