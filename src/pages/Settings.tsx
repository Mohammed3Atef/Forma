import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ActivityLevel, Goal, Locale, ReminderKind } from '@/types';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/services/auth/sessionStore';
import { cloudAvailable } from '@/data/dataSource';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { assessmentStatus } from '@/lib/assessment';
import { parseDecimal, shortDate } from '@/lib/utils';
import { useReminders } from '@/services/reminders/reminderStore';
import { useCloud } from '@/services/auth/cloudStore';
import { useDay } from '@/stores/dayStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useWorkout } from '@/stores/workoutStore';
import { useHabits } from '@/stores/habitStore';
import { usePhotos } from '@/stores/photoStore';
import { clearAllLocalData, clearDayData } from '@/data/reset';
import { confirmDialog, alertDialog, confirmDelete } from '@/stores/dialogStore';
import { ensurePersistentStorage, isStoragePersisted } from '@/lib/storage';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { CoachInfoCard } from '@/components/CoachInfoCard';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { Switch } from '@/components/ui/Switch';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { AssessmentStatus } from '@/types';

const GOALS: Goal[] = ['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength'];
const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const ASSESS_TONE: Record<AssessmentStatus, PillTone> = {
  not_started: 'mute',
  in_progress: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
  updated_after_review: 'warn',
};

type Tab = 'profile' | 'preferences' | 'account';
const TABS: Tab[] = ['profile', 'preferences', 'account'];

/**
 * One grouped-settings row: icon chip + label(+sub) + trailing control —
 * matches the design's settings() row exactly. `stack` drops the control onto
 * its own full-width line below the label, for controls too wide to share a
 * row at mobile widths (e.g. a 3-way language segmented control).
 */
function Row({ icon, label, sub, stack, children }: { icon: IconName; label: string; sub?: string; stack?: boolean; children: ReactNode }) {
  return (
    <div className={`row ${stack ? 'flex-col !items-stretch gap-2.5' : ''}`}>
      <div className={stack ? 'flex items-center gap-3.5' : 'contents'}>
        <span className="row-av">
          <Icon name={icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug">{label}</span>
          {sub && <span className="block text-[12px] text-earth-subtle">{sub}</span>}
        </span>
        {!stack && <span className="flex shrink-0 items-center gap-2">{children}</span>}
      </div>
      {stack && <div>{children}</div>}
    </div>
  );
}

/**
 * The client's single Settings workspace — one featured identity card (always
 * visible, matching the design's settings() screen) plus a Profile /
 * Preferences / Account tab set that folds in what used to be two separate
 * pages (Settings + ClientSettings) and three standalone link-cards (Video
 * manager / Import data / Force update, now one "Tools" row group).
 */
export function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'profile');
  const setTab = (next: Tab) => setParams(next === 'profile' ? {} : { tab: next }, { replace: true });

  const profile = useSettings((s) => s.profile);
  const settings = useSettings((s) => s.settings);
  const updateProfile = useSettings((s) => s.updateProfile);
  const updateSettings = useSettings((s) => s.updateSettings);
  const setLocale = useSettings((s) => s.setLocale);
  const account = useSession((s) => s.account);
  const updateContact = useSession((s) => s.updateContact);
  const updateSelf = useSession((s) => s.updateSelf);

  const accountPhone = account?.phone ?? '';
  const [phone, setPhone] = useState(accountPhone);
  useEffect(() => { setPhone(accountPhone); }, [accountPhone]);
  const [pwOpen, setPwOpen] = useState(false);

  const uid = account?.id ?? '';
  const cloud = cloudAvailable() && !!uid && uid !== 'local-user';
  const assessment = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: cloud });
  const aStatus = assessmentStatus(assessment.data);

  // Preferences tab state
  const reminders = useReminders((s) => s.reminders);
  const updateReminder = useReminders((s) => s.update);
  const addReminder = useReminders((s) => s.add);
  const removeReminder = useReminders((s) => s.remove);
  const requestPermission = useReminders((s) => s.requestPermission);
  const [newRem, setNewRem] = useState<{ kind: ReminderKind; time: string }>({ kind: 'meal', time: '09:00' });
  const triggersAvailable = 'Notification' in window && 'showTrigger' in Notification.prototype;

  // Account tab state
  const cloudState = useCloud();
  const selectedDay = useDay((s) => s.selected);
  const [persisted, setPersisted] = useState(true);
  useEffect(() => {
    void ensurePersistentStorage().then(() => isStoragePersisted().then(setPersisted));
  }, []);

  if (!profile || !settings) return null;

  const memberSince = new Date(profile.createdAt).toLocaleDateString(settings.locale.startsWith('ar') ? 'ar-EG' : 'en-US', { month: 'short', year: 'numeric' });

  const enableNotifications = async () => {
    const granted = await requestPermission();
    await updateSettings({ notificationsEnabled: granted });
  };

  const clearDay = async () => {
    const ok = await confirmDialog({ title: t('settings.clearDay'), message: t('settings.clearDayConfirm', { date: shortDate(selectedDay, settings.locale) }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    await clearDayData(selectedDay);
    await Promise.all([
      useNutrition.getState().load(selectedDay),
      useWorkout.getState().load(),
      useCardio.getState().load(),
      usePhotos.getState().load(),
    ]);
    useWorkout.getState().loadDay(selectedDay);
    await useHabits.getState().refresh(selectedDay);
    if (cloudState.user) void cloudState.syncNow(true);
  };

  const forceUpdate = async () => {
    const ok = await confirmDialog({ title: t('settings.forceUpdate'), message: t('settings.forceUpdateConfirm'), confirmLabel: t('settings.forceUpdate') });
    if (!ok) return;
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const resetAll = async () => {
    const ok = await confirmDialog({ title: t('settings.resetAll'), message: t('settings.resetConfirm'), confirmLabel: t('settings.resetAll'), danger: true });
    if (!ok) return;
    if (cloudState.user) {
      if (!navigator.onLine) {
        await alertDialog({ title: t('settings.resetAll'), message: t('settings.resetOffline') });
      } else {
        try { await cloudState.wipeCloud(); } catch { /* ignore */ }
      }
    }
    await clearAllLocalData();
    window.location.reload();
  };

  return (
    <div className="anim-rise space-y-4 pb-4">
      <TopBar
        title={t('settings.title')}
        eyebrow={t('gt.athlete')}
        right={<SyncStatusBadge />}
      />

      {/* Featured identity card — stays visible above the tabs, like the design's settings() screen */}
      <div className="card-featured space-y-3">
        {cloud ? (
          <AvatarPicker name={profile.name} photoUrl={account?.photoUrl} folder={`Forma/${uid}/avatar`} onChange={(url) => void updateSelf({ photoUrl: url })} />
        ) : null}
        <div>
          <h2 className="truncate font-display text-lg font-semibold">{profile.name}</h2>
          <p className="font-mono text-[11.5px] text-earth-muted">{t('gt.memberSince', { date: memberSince, unit: t('common.kg') })}</p>
        </div>
      </div>

      <div className="seg" data-testid="settings-tabs">
        {TABS.map((tk) => (
          <button key={tk} type="button" data-testid={`settings-tab-${tk}`} onClick={() => setTab(tk)} className={tab === tk ? 'on' : ''}>
            {t(`settings.tabs.${tk}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <section className="card space-y-3">
          <div>
            <label className="label">{t('settings.name')}</label>
            <input className="input" value={profile.name} onChange={(e) => void updateProfile({ name: e.target.value })} />
          </div>
          {cloud && (
            <div>
              <label className="label">{t('settings.phone')}</label>
              <input className="input" type="tel" inputMode="tel" dir="ltr" data-testid="settings-phone" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => { if (phone.trim() !== accountPhone) void updateContact(phone); }} />
            </div>
          )}
          {/* Cloud/coached clients have this data live elsewhere (a real Assessment
              + ongoing weight tracking in Progress) — showing a frozen one-time
              snapshot here just drifts out of sync with it. Local-only accounts
              have no assessment/coach, so this is their only profile entry. */}
          {!cloud && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">{t('settings.age')}</label>
                  <input className="input" inputMode="numeric" value={profile.age} onChange={(e) => void updateProfile({ age: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="label">{t('settings.weight')}</label>
                  <input className="input" inputMode="decimal" value={profile.weightKg} onChange={(e) => void updateProfile({ weightKg: parseDecimal(e.target.value) })} />
                </div>
                <div>
                  <label className="label">{t('settings.height')}</label>
                  <input className="input" inputMode="decimal" value={profile.heightCm} onChange={(e) => void updateProfile({ heightCm: parseDecimal(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="label">{t('settings.goal')}</label>
                <select className="input" value={profile.goal} onChange={(e) => void updateProfile({ goal: e.target.value as Goal })}>
                  {GOALS.map((g) => <option key={g} value={g}>{t(`settings.goals.${g}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('settings.activity')}</label>
                <select className="input" value={profile.activityLevel} onChange={(e) => void updateProfile({ activityLevel: e.target.value as ActivityLevel })}>
                  {ACTIVITY.map((a) => <option key={a} value={a}>{t(`settings.activities.${a}`)}</option>)}
                </select>
              </div>
            </>
          )}
          {cloud && (
            <button type="button" data-testid="change-password" className="btn-ghost w-full" onClick={() => setPwOpen(true)}>
              <Icon name="settings" size={16} /> {t('auth.changePassword')}
            </button>
          )}
        </section>
      )}

      {tab === 'preferences' && (
        <>
          <section>
            <p className="ui-label mb-2 px-1">{t('settings.preferences')}</p>
            <div className="card py-1">
              <Row icon="globe" label={t('settings.language')} stack>
                <div className="seg">
                  {(['en', 'ar', 'ar-eg'] as Locale[]).map((l) => (
                    <button key={l} type="button" onClick={() => void setLocale(l)} className={settings.locale === l ? 'on' : ''}>
                      {l === 'en' ? 'EN' : l === 'ar' ? 'ع' : 'مصري'}
                    </button>
                  ))}
                </div>
              </Row>
              <Row icon="timer" label={t('settings.restDefault')}>
                <input className="input h-10 w-20 py-1 text-center" inputMode="decimal" value={settings.restDefaultSec} onChange={(e) => void updateSettings({ restDefaultSec: Math.max(0, parseDecimal(e.target.value)) })} />
              </Row>
              <Row icon="target" label={t('settings.weeklyGoal')}>
                <input className="input h-10 w-20 py-1 text-center" inputMode="numeric" value={settings.weeklyWorkoutGoal ?? 5} onChange={(e) => void updateSettings({ weeklyWorkoutGoal: Math.min(14, Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1)) })} />
              </Row>
              <Row icon="flame" label={t('settings.keepAwake')}>
                <Switch on={settings.keepAwakeDuringWorkout} onChange={() => void updateSettings({ keepAwakeDuringWorkout: !settings.keepAwakeDuringWorkout })} label={t('settings.keepAwake')} />
              </Row>
              <Row icon="bolt" label={t('settings.vibration')}>
                <Switch on={settings.vibrationEnabled} onChange={() => void updateSettings({ vibrationEnabled: !settings.vibrationEnabled })} label={t('settings.vibration')} />
              </Row>
              <Row icon="bell" label={t('settings.notifications')}>
                <Switch
                  on={settings.notificationsEnabled}
                  onChange={() => void (settings.notificationsEnabled ? updateSettings({ notificationsEnabled: false }) : enableNotifications())}
                  label={t('settings.notifications')}
                />
              </Row>
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">{t('settings.reminders')}</h2>
            {reminders.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <input type="time" value={r.time} onChange={(e) => void updateReminder({ ...r, time: e.target.value })} className="input h-10 w-28 py-1" />
                <span className="flex-1 truncate text-sm">{t(`reminderKinds.${r.kind}`)}</span>
                <Switch on={r.enabled} onChange={() => void updateReminder({ ...r, enabled: !r.enabled })} label={t(`reminderKinds.${r.kind}`)} />
                <button type="button" onClick={async () => { if (await confirmDelete()) void removeReminder(r.id); }} className="icon-btn h-9 w-9 text-danger" aria-label={t('common.delete')}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-white/5 pt-2">
              <input type="time" value={newRem.time} onChange={(e) => setNewRem({ ...newRem, time: e.target.value })} className="input h-10 w-28 py-1" />
              <select value={newRem.kind} onChange={(e) => setNewRem({ ...newRem, kind: e.target.value as ReminderKind })} className="input h-10 flex-1 py-1 text-sm">
                {(['meal', 'supplements', 'creatine', 'water', 'workout', 'cardio'] as ReminderKind[]).map((k) => (
                  <option key={k} value={k}>{t(`reminderKinds.${k}`)}</option>
                ))}
              </select>
              <button type="button" onClick={() => void addReminder(newRem.kind, newRem.time, t(`reminderKinds.${newRem.kind}`))} className="btn-primary h-10 px-3 text-sm">
                <Icon name="plus" size={16} /> {t('common.add')}
              </button>
            </div>
            {!settings.notificationsEnabled && <p className="text-xs text-earth-subtle">{t('settings.enableNotifications')} ↑</p>}
            {settings.notificationsEnabled && !triggersAvailable && <p className="text-xs text-earth-subtle">{t('settings.notifWhileOpen')}</p>}
          </section>

          <section>
            <p className="ui-label mb-2 px-1">{t('settings.tools')}</p>
            <div className="card py-1">
              <button type="button" onClick={() => navigate('/settings/videos')} className="row w-full text-start">
                <span className="row-av"><Icon name="video" size={16} /></span>
                <span className="min-w-0 flex-1 font-medium">{t('settings.videos')}</span>
                <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
              </button>
              <button type="button" onClick={() => navigate('/settings/import')} className="row w-full text-start">
                <span className="row-av"><Icon name="download" size={16} /></span>
                <span className="min-w-0 flex-1 font-medium">{t('settings.import')}</span>
                <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
              </button>
              <button type="button" onClick={() => void forceUpdate()} className="row w-full text-start">
                <span className="row-av"><Icon name="timer" size={16} /></span>
                <span className="min-w-0 flex-1 font-medium">{t('settings.forceUpdate')}</span>
                <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
              </button>
            </div>
          </section>
        </>
      )}

      {tab === 'account' && (
        <>
          <CoachInfoCard />

          {cloud && assessment.data && (
            <button type="button" data-testid="profile-assessment" onClick={() => navigate('/assessment')} className="card-tap flex w-full items-center gap-3 text-start">
              <span className="row-av bg-brand/15 text-brand"><Icon name="list" size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('assessment.title')}</span>
                <span className="block text-[13px] text-earth-muted">{t('assessment.lastUpdated')}: {assessment.data.updatedAt ? new Date(assessment.data.updatedAt).toLocaleDateString(i18n.language) : '—'}</span>
              </span>
              <Pill tone={ASSESS_TONE[aStatus]}>{t(`assessment.status.${aStatus}`)}</Pill>
              <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
            </button>
          )}

          <button type="button" data-testid="settings-subscription-link" onClick={() => navigate('/settings/subscription')} className="card-tap flex w-full items-center gap-3 text-start">
            <span className="row-av bg-brand/15 text-brand"><Icon name="shield" size={18} /></span>
            <span className="min-w-0 flex-1 font-medium">{t('nav.subscription')}</span>
            <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
          </button>

          <section className="card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-bold">{t('settings.cloud')}</h2>
              <SyncStatusBadge />
            </div>
            {!cloudState.available ? (
              <p className="text-sm text-earth-muted">{t('settings.localOnly')}</p>
            ) : cloudState.user ? (
              <div className="space-y-2">
                {cloudState.error ? (
                  <p className="text-sm font-medium text-danger">
                    <span className="flex items-center gap-1.5"><Icon name="close" size={16} /> {t('cloudState.error')}</span>
                    <span className="mt-1 block break-words text-xs font-normal text-earth-muted">{cloudState.error}</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-brand">
                    <Icon name="check" size={16} /> {cloudState.syncing ? t('settings.syncing') : t('settings.synced')}
                  </p>
                )}
                <p className="text-sm text-earth-muted">{cloudState.user.email}</p>
                {cloudState.lastSync && <p className="text-xs text-earth-subtle">{t('settings.lastSync')}: {new Date(cloudState.lastSync).toLocaleTimeString()}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => void cloudState.syncNow(true)} disabled={cloudState.syncing} className="btn-primary flex-1">{cloudState.syncing ? '…' : t('settings.syncNow')}</button>
                  <button type="button" onClick={() => void cloudState.signOut()} className="btn-ghost flex-1">{t('settings.signOut')}</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card space-y-2">
            <h2 className="mb-1 font-bold text-danger">{t('settings.data')}</h2>
            <p className={`flex items-center gap-1.5 text-xs ${persisted ? 'text-brand' : 'text-warn'}`}>
              <Icon name={persisted ? 'check' : 'flame'} size={14} />
              {persisted ? t('settings.storagePersisted') : t('settings.storageAtRisk')}
            </p>
            <button type="button" onClick={() => void clearDay()} className="btn-ghost w-full justify-between text-sm">
              <span className="flex items-center gap-2"><Icon name="close" size={16} /> {t('settings.clearDay')}</span>
              <span className="text-xs text-earth-muted">{shortDate(selectedDay, settings.locale)}</span>
            </button>
            <button type="button" onClick={() => void resetAll()} className="btn-danger w-full text-sm">{t('settings.resetAll')}</button>
          </section>
        </>
      )}

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
