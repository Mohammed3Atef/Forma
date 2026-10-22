import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Locale, ReminderKind } from '@/types';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { assessmentStatus } from '@/lib/assessment';
import { useReminders } from '@/services/reminders/reminderStore';
import { useCloud } from '@/services/auth/cloudStore';
import { countPendingChanges } from '@/data/sync/pending';
import { draftsOnDevice, pendingOnDevice, removeAccountDataFromDevice } from '@/data/deviceData';
import { alertDialog, confirmDialog, confirmDelete } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useWorkoutInProgress } from '@/components/client/ResumeBar';
import { SyncStatus } from '@/components/ui/SyncStatus';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { TrainingGuideSheet } from '@/components/TrainingGuideSheet';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { NumericField } from '@/components/ui/NumericField';
import { LoadingState } from '@/components/ui/LoadingState';
import { Switch } from '@/components/ui/Switch';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { SaveStatusBadge, useSaveStatus } from '@/components/ui/SaveStatus';
import { useMyCoach } from '@/hooks/useMyCoach';
import { SUPPORT_EMAIL } from '@/lib/contact';
import type { AssessmentStatus } from '@/types';
import { formatDate } from '@/lib/format';

const ASSESS_CLASS: Record<AssessmentStatus, string> = {
  not_started: 'bg-white/[0.08] text-earth-muted',
  in_progress: 'bg-warn/15 text-warn',
  submitted: 'bg-info/15 text-info',
  reviewed: 'bg-success/15 text-success',
  updated_after_review: 'bg-warn/15 text-warn',
};

type Tab = 'profile' | 'preferences' | 'account';
const TABS: Tab[] = ['profile', 'preferences', 'account'];

/** Local mirror of a store value, committed after `delay` ms without further changes. */
function useDebouncedField<T>(storeValue: T, commit: (v: T) => Promise<void>, status: ReturnType<typeof useSaveStatus>, delay = 600) {
  const [local, setLocal] = useState(storeValue);
  const lastExternal = useRef(storeValue);
  useEffect(() => {
    if (storeValue !== lastExternal.current) {
      lastExternal.current = storeValue;
      setLocal(storeValue);
    }
  }, [storeValue]);
  const timer = useRef<number | undefined>(undefined);
  const onChange = (v: T) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastExternal.current = v;
      void status.run(() => commit(v));
    }, delay);
  };
  return [local, onChange] as const;
}

/** A settings row: icon tile, label (+ hint) and a trailing control; `stack` puts a wide control on its own line. */
function Row({ icon, label, hint, stack, children }: { icon: IconName; label: string; hint?: string; stack?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-h-14 gap-3 px-4 py-2.5 ${stack ? 'flex-col' : 'items-center'}`}>
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${stack ? '' : ''}`}>
        <IconTile icon={icon} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug">{label}</span>
          {hint && <span className="block text-[13px] text-earth-muted">{hint}</span>}
        </span>
      </div>
      <div className={stack ? '' : 'flex shrink-0 items-center gap-2'}>{children}</div>
    </div>
  );
}

/*
 * YOU (B2.7) — behind the avatar, not a tab. Three sections, deep-linkable as
 * before (`?tab=profile|preferences|account`):
 *   Profile — photo, name, phone, password.
 *   Preferences — language, workout defaults, notifications and reminders.
 *   Account — coach, assessment, subscription, sync, help, privacy, sign out.
 * Retired (B2 blueprint D7 / D8): "Update the app" (updates apply themselves
 * at a safe point, B1), the weekly-goal input (the goal is the plan) and the
 * storage notice. Never reintroduced: reset-all-data, import, debug sync.
 */
export function Settings() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'profile';
  const setTab = (next: Tab) => setParams(next === 'profile' ? {} : { tab: next }, { replace: true });

  const profile = useSettings((s) => s.profile);
  const settings = useSettings((s) => s.settings);
  const updateProfile = useSettings((s) => s.updateProfile);
  const updateSettings = useSettings((s) => s.updateSettings);
  const setLocale = useSettings((s) => s.setLocale);
  const account = useSession((s) => s.account);
  const updateContact = useSession((s) => s.updateContact);
  const updateSelf = useSession((s) => s.updateSelf);
  const coach = useMyCoach();
  const workoutRunning = useWorkoutInProgress();

  const accountPhone = account?.phone ?? '';
  const [phone, setPhone] = useState(accountPhone);
  useEffect(() => setPhone(accountPhone), [accountPhone]);
  const [pwOpen, setPwOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const uid = account?.id ?? '';
  const assessment = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: !!uid });
  const aStatus = assessmentStatus(assessment.data);

  const reminders = useReminders((s) => s.reminders);
  const updateReminder = useReminders((s) => s.update);
  const addReminder = useReminders((s) => s.add);
  const removeReminder = useReminders((s) => s.remove);
  const requestPermission = useReminders((s) => s.requestPermission);
  const [newRem, setNewRem] = useState<{ kind: ReminderKind; time: string }>({ kind: 'meal', time: '09:00' });
  const triggersAvailable = 'Notification' in window && 'showTrigger' in Notification.prototype;

  const cloudState = useCloud();
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const profileStatus = useSaveStatus();
  const prefsStatus = useSaveStatus();
  // The name is ALSO the account display name others see (coach roster, messages) — commit it there too.
  const [nameLocal, onNameChange] = useDebouncedField(
    profile?.name ?? '',
    async (v) => {
      await updateProfile({ name: v });
      const trimmed = v.trim();
      if (trimmed && trimmed !== account?.displayName) await updateSelf({ displayName: trimmed });
    },
    profileStatus,
  );
  const [restLocal, onRestChange] = useDebouncedField(settings?.restDefaultSec ?? 0, (v) => updateSettings({ restDefaultSec: v }), prefsStatus);

  if (!profile || !settings) return <LoadingState variant="list" count={4} />;

  const memberSince = formatDate(profile.createdAt, settings.locale, 'monthYear');

  const enableNotifications = async () => {
    const granted = await requestPermission();
    await updateSettings({ notificationsEnabled: granted });
  };

  // B0 sign-out: push what can be pushed (bounded), then say what is still only on this device.
  const signOut = async () => {
    setLeaving(true);
    try {
      await Promise.race([cloudState.syncNow(true), new Promise((r) => setTimeout(r, 5_000))]).catch(() => undefined);
      const pending = await countPendingChanges().catch(() => 0);
      const message = pending > 0 ? `${t('platform.signOutConfirm')}\n\n${t('trust.sync.pendingSignOut', { n: pending })}` : t('platform.signOutConfirm');
      if (await confirmDialog({ title: t('settings.signOut'), message, danger: true })) await useSession.getState().signOut();
    } finally {
      setLeaving(false);
    }
  };

  // Remove this account's data from this device — never the server's copy; never anything unsynced.
  const removeDeviceData = async () => {
    if (!uid) return;
    setRemoving(true);
    try {
      if (workoutRunning) {
        await alertDialog({ title: t('you.removeBlockedTitle'), message: t('you.removeWorkoutRunning') });
        return;
      }
      await Promise.race([cloudState.syncNow(true), new Promise((r) => setTimeout(r, 5_000))]).catch(() => undefined);
      const pending = await pendingOnDevice();
      if (pending > 0) {
        await alertDialog({
          title: t('you.removeBlockedTitle'),
          message: Number.isFinite(pending) ? t('you.removePending', { count: pending }) : t('you.removeUnverified'),
        });
        return;
      }
      const drafts = await draftsOnDevice(uid);
      const message = drafts > 0 ? `${t('you.removeBody')}\n\n${t('you.removeDrafts', { count: drafts })}` : t('you.removeBody');
      if (!(await confirmDialog({ title: t('you.removeTitle'), message, confirmLabel: t('you.removeConfirm'), cancelLabel: t('common.cancel'), danger: true }))) return;
      await useSession.getState().signOut();
      try {
        await removeAccountDataFromDevice(uid);
        showToast({ title: t('you.removedTitle'), body: t('you.removedBody'), variant: 'success' });
      } catch {
        showToast({ title: t('you.removeFailedTitle'), body: t('you.removeFailedBody'), variant: 'warning' });
      }
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-7" data-testid="client-you">
      {/* Identity (the photo is changed in Profile) */}
      <section className="flex items-center gap-4">
        <Avatar name={profile.name} photoUrl={account?.photoUrl} size="lg" rounded="rounded-full" className="h-16 w-16 shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-semibold leading-tight">{profile.name}</h2>
          <p className="mt-0.5 text-[13px] text-earth-muted">{t('gt.memberSince', { date: memberSince })}</p>
        </div>
      </section>

      <div className="seg seg-quiet" data-testid="settings-tabs" role="tablist" aria-label={t('you.sections')}>
        {TABS.map((tk) => (
          <button key={tk} type="button" role="tab" aria-selected={tab === tk} data-testid={`settings-tab-${tk}`} onClick={() => setTab(tk)} className={tab === tk ? 'on' : ''}>
            {t(`settings.tabs.${tk}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <Section title={t('you.details')} action={<SaveStatusBadge status={profileStatus.status} />}>
          <div className="space-y-4 rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
            <AvatarPicker name={profile.name} photoUrl={account?.photoUrl} onChange={(url) => updateSelf({ photoUrl: url })} />
            <div>
              <label className="mb-1.5 block text-[14px] font-medium" htmlFor="settings-name">
                {t('settings.name')}
              </label>
              <input id="settings-name" className="input" value={nameLocal} onChange={(e) => onNameChange(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className="mb-1.5 block text-[14px] font-medium" htmlFor="settings-phone">
                {t('settings.phone')}
              </label>
              <input
                id="settings-phone"
                className="input"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                data-testid="settings-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => {
                  if (phone.trim() !== accountPhone) void profileStatus.run(() => updateContact(phone));
                }}
              />
            </div>
          </div>
          <ListGroup className="mt-3">
            <ListRow onClick={() => setPwOpen(true)} testId="change-password" leading={<IconTile icon="lock" size={36} />} title={t('auth.changePassword')} chevron />
          </ListGroup>
        </Section>
      )}

      {tab === 'preferences' && (
        <>
          <Section title={t('settings.preferences')} action={<SaveStatusBadge status={prefsStatus.status} />}>
            <ListGroup>
              <Row icon="globe" label={t('settings.language')} stack>
                <div className="seg seg-quiet">
                  {(['en', 'ar', 'ar-eg'] as Locale[]).map((l) => (
                    <button key={l} type="button" aria-pressed={settings.locale === l} onClick={() => void prefsStatus.run(() => setLocale(l))} className={settings.locale === l ? 'on' : ''}>
                      {l === 'en' ? 'EN' : l === 'ar' ? 'ع' : 'مصري'}
                    </button>
                  ))}
                </div>
              </Row>
              <Row icon="timer" label={t('settings.restDefault')} hint={t('you.restHint')}>
                <div className="w-24">
                  <NumericField ariaLabel={t('settings.restDefault')} suffix={t('you.sec')} value={restLocal} onChange={(n) => onRestChange(Math.max(0, Math.round(n ?? 0)))} />
                </div>
              </Row>
              <Row icon="flame" label={t('settings.keepAwake')} hint={t('you.keepAwakeHint')}>
                <Switch on={settings.keepAwakeDuringWorkout} onChange={() => void prefsStatus.run(() => updateSettings({ keepAwakeDuringWorkout: !settings.keepAwakeDuringWorkout }))} label={t('settings.keepAwake')} />
              </Row>
              <Row icon="bolt" label={t('settings.vibration')}>
                <Switch on={settings.vibrationEnabled} onChange={() => void prefsStatus.run(() => updateSettings({ vibrationEnabled: !settings.vibrationEnabled }))} label={t('settings.vibration')} />
              </Row>
              <Row icon="bell" label={t('settings.notifications')} hint={t('you.notificationsHint')}>
                <Switch
                  on={settings.notificationsEnabled}
                  onChange={() => void prefsStatus.run(() => (settings.notificationsEnabled ? updateSettings({ notificationsEnabled: false }) : enableNotifications()))}
                  label={t('settings.notifications')}
                />
              </Row>
            </ListGroup>
          </Section>

          <Section title={t('settings.reminders')} testId="you-reminders">
            <ListGroup>
              {reminders.map((r) => (
                <div key={r.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <input type="time" value={r.time} onChange={(e) => void updateReminder({ ...r, time: e.target.value })} className="input h-11 w-[7.5rem] py-1" aria-label={t('you.reminderTime', { kind: t(`reminderKinds.${r.kind}`) })} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{t(`reminderKinds.${r.kind}`)}</span>
                  <Switch on={r.enabled} onChange={() => void updateReminder({ ...r, enabled: !r.enabled })} label={t(`reminderKinds.${r.kind}`)} />
                  <ActionMenu
                    size="sm"
                    label={t('you.reminderOptions', { kind: t(`reminderKinds.${r.kind}`) })}
                    items={[{ key: 'delete', label: t('common.delete'), icon: 'trash', danger: true, onSelect: async () => { if (await confirmDelete()) void removeReminder(r.id); } }]}
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <input type="time" value={newRem.time} onChange={(e) => setNewRem({ ...newRem, time: e.target.value })} className="input h-11 w-[7.5rem] py-1" aria-label={t('you.newReminderTime')} />
                <select value={newRem.kind} onChange={(e) => setNewRem({ ...newRem, kind: e.target.value as ReminderKind })} className="input h-11 min-w-0 flex-1 py-1 text-[14px]" aria-label={t('you.newReminderKind')}>
                  {(['meal', 'supplements', 'creatine', 'water', 'workout', 'cardio'] as ReminderKind[]).map((k) => (
                    <option key={k} value={k}>
                      {t(`reminderKinds.${k}`)}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" icon="plus" onClick={() => void addReminder(newRem.kind, newRem.time, t(`reminderKinds.${newRem.kind}`))}>
                  {t('common.add')}
                </Button>
              </div>
            </ListGroup>
            {!settings.notificationsEnabled && <p className="mt-2 text-[13px] text-earth-muted">{t('you.remindersNeedNotifications')}</p>}
            {settings.notificationsEnabled && !triggersAvailable && <p className="mt-2 text-[13px] text-earth-muted">{t('settings.notifWhileOpen')}</p>}
          </Section>
        </>
      )}

      {tab === 'account' && (
        <>
          <Section title={t('you.coaching')}>
            <ListGroup>
              {coach.coachId ? (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2.5" data-testid="coach-info">
                  <Link to="/messages" className="flex min-w-0 flex-1 items-center gap-3" data-testid="coach-message">
                    <Avatar name={coach.name || t('coachInfo.yourCoach')} photoUrl={coach.photoUrl} size="sm" rounded="rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{coach.name || t('coachInfo.yourCoach')}</span>
                      <span className="block text-[13px] text-earth-muted">{t('you.messageCoach')}</span>
                    </span>
                  </Link>
                  {coach.coach?.phone && (
                    <a href={`tel:${coach.coach.phone}`} className="hit-44 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.1] text-earth-muted hover:text-earth" aria-label={t('you.callCoach', { phone: coach.coach.phone })}>
                      <Icon name="phone" size={18} />
                    </a>
                  )}
                </div>
              ) : (
                <ListRow leading={<IconTile icon="users" size={36} />} title={t('clientCoach.noCoachTitle')} meta={t('today.noCoachBody')} />
              )}
              {assessment.data && (
                <ListRow
                  to="/assessment"
                  testId="profile-assessment"
                  leading={<IconTile icon="clip" size={36} />}
                  title={t('nav.assessment')}
                  meta={`${t('assessment.lastUpdated')}: ${assessment.data.updatedAt ? formatDate(assessment.data.updatedAt, i18n.language, 'medium') : '—'}`}
                  trailing={<span className={`rounded-ui-pill px-2.5 py-1 text-[12px] font-semibold ${ASSESS_CLASS[aStatus]}`}>{t(`assessment.status.${aStatus}`)}</span>}
                  chevron
                />
              )}
              <ListRow to="/settings/subscription" testId="settings-subscription-link" leading={<IconTile icon="shield" size={36} />} title={t('nav.subscription')} meta={t('you.subscriptionMeta')} chevron />
            </ListGroup>
          </Section>

          <Section title={t('you.accountSync')}>
            <div className="space-y-3 rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
              <p className="text-[15px]">{account?.email}</p>
              {/* One truthful status (B1.7): never "Synced" while anything is unacknowledged. */}
              <SyncStatus variant="detail" />
              {cloudState.user && (
                <Button variant="secondary" className="w-full" pending={cloudState.syncing} onClick={() => void cloudState.syncNow(true)}>
                  {t('settings.syncNow')}
                </Button>
              )}
            </div>
          </Section>

          <Section title={t('you.help')}>
            <ListGroup>
              <ListRow onClick={() => setGuideOpen(true)} leading={<IconTile icon="info" size={36} />} title={t('guide.title')} meta={t('train.guideMeta')} chevron />
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                <IconTile icon="mail" size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{t('you.contactSupport')}</span>
                  <span className="block truncate text-[13px] text-earth-muted">
                    <span dir="ltr">{SUPPORT_EMAIL}</span>
                  </span>
                </span>
              </a>
            </ListGroup>
          </Section>

          <Section title={t('you.privacy')}>
            <ListGroup>
              <button type="button" onClick={() => void removeDeviceData()} disabled={removing} data-testid="remove-device-data" className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03] disabled:opacity-60">
                <IconTile icon="trash" size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{t('you.removeRow')}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-earth-muted" role={removing ? 'status' : undefined}>
                    {removing ? t('you.removing') : t('you.removeRowMeta')}
                  </span>
                </span>
              </button>
            </ListGroup>
          </Section>

          <ListGroup>
            <button type="button" data-testid="client-sign-out" disabled={leaving} onClick={() => void signOut()} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-white/[0.03] disabled:opacity-50">
              <IconTile icon="logout" size={36} />
              <span className="flex-1 text-[15px] font-semibold">{leaving ? t('you.signingOut') : t('settings.signOut')}</span>
            </button>
          </ListGroup>
        </>
      )}

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <TrainingGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
