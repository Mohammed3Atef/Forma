import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { confirmDialog } from '@/stores/dialogStore';
import { whatsappUrl } from '@/lib/contact';

/**
 * Me (B3.1 / blueprint §5.1, owner O-2): everything that is about the coach's
 * own business and account — reached from the avatar on phones and the rail's
 * footer from 768 px. It replaces the ☰ menu's long tail and the WhatsApp
 * floating button (Help & support lives here — RM-34, RM-48).
 *
 * The coaching tools that once lived here moved to their destinations:
 * assessments to review → Today (B3.2); weekly check-ins and the workout
 * ranking → Clients (B3.3, `?view=checkins`, `?sort=workouts`).
 */
export function CoachMe() {
  const { t } = useTranslation();
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);
  const { state, daysLeft } = useCoachPlan();
  const name = account?.displayName || account?.email || '';

  const planMeta =
    state === 'trial' && daysLeft != null ? t('coachMe.planState.trialDays', { count: daysLeft }) : t(`coachMe.planState.${state}`);

  const onSignOut = async () => {
    const ok = await confirmDialog({ title: t('settings.signOut'), message: t('platform.signOutConfirm'), confirmLabel: t('settings.signOut'), danger: true });
    if (ok) await signOut();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4 pt-3" data-testid="coach-me">
      <div className="flex items-center gap-4">
        <Avatar name={name} photoUrl={account?.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="t-title truncate">{name || t('coachNav.me')}</h1>
          {account?.email ? <p className="truncate text-[14px] text-earth-muted">{account.email}</p> : null}
        </div>
      </div>

      <Section title={t('coachMe.business')}>
        <ListGroup>
          <ListRow to="/coach/revenue" testId="me-revenue" leading={<IconTile icon="bolt" tone="brand" />} title={t('coachMe.revenue')} meta={t('coachMe.revenueMeta')} chevron />
          <ListRow to="/coach/subscription-plans" testId="me-packages" leading={<IconTile icon="calendar" />} title={t('coachMe.packages')} meta={t('coachMe.packagesMeta')} chevron />
          <ListRow to="/coach/reports" testId="me-reports" leading={<IconTile icon="chart" />} title={t('coachMe.reports')} meta={t('coachMe.reportsMeta')} chevron />
        </ListGroup>
      </Section>

      <Section title={t('coachMe.forma')}>
        <ListGroup>
          <ListRow to="/coach/plan" testId="me-forma" leading={<IconTile icon="shield" tone={state === 'expired' || state === 'suspended' ? 'warn' : 'success'} />} title={t('coachMe.formaSubscription')} meta={planMeta} chevron />
        </ListGroup>
      </Section>

      <Section title={t('coachMe.account')}>
        <ListGroup>
          <ListRow to="/coach/settings" testId="me-account" leading={<IconTile icon="user" />} title={t('coachMe.accountRow')} meta={t('coachMe.accountMeta')} chevron />
          <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" data-testid="me-help" className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-white/[0.03]">
            <IconTile icon="chat" tone="info" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-snug">{t('coachMe.help')}</span>
              <span className="mt-0.5 block truncate text-[13px] leading-snug text-earth-muted">{t('coachMe.helpMeta')}</span>
            </span>
            <Icon name="arrowR" size={18} className="shrink-0 text-earth-subtle" mirror />
          </a>
        </ListGroup>
      </Section>

      <button type="button" onClick={() => void onSignOut()} data-testid="me-sign-out" className="flex min-h-ui-hit w-full items-center justify-center rounded-ui-control border border-white/[0.08] text-[15px] font-semibold text-danger hover:bg-danger/10">
        {t('settings.signOut')}
      </button>
    </div>
  );
}
