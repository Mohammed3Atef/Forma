import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Locale, ReminderKind } from '@/types';
import { useSettings } from '@/stores/settingsStore';
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
import { parseDecimal, shortDate } from '@/lib/utils';
import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { Switch } from '@/components/ui/Switch';

/** One grouped-settings row: icon chip + label(+sub) + trailing control — matches the design's settings() row exactly. */
function Row({ icon, label, sub, children }: { icon: IconName; label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-av">
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub && <span className="block truncate text-[12px] text-earth-subtle">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </div>
  );
}

/** Client preferences, reminders, integrations, cloud sync and data — split out of the lean Profile. */
export function ClientSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.updateSettings);
  const setLocale = useSettings((s) => s.setLocale);
  const reminders = useReminders((s) => s.reminders);
  const updateReminder = useReminders((s) => s.update);
  const addReminder = useReminders((s) => s.add);
  const removeReminder = useReminders((s) => s.remove);
  const requestPermission = useReminders((s) => s.requestPermission);
  const cloud = useCloud();
  const selectedDay = useDay((s) => s.selected);

  const [newRem, setNewRem] = useState<{ kind: ReminderKind; time: string }>({ kind: 'meal', time: '09:00' });
  const triggersAvailable = 'Notification' in window && 'showTrigger' in Notification.prototype;
  const [persisted, setPersisted] = useState(true);
  useEffect(() => {
    void ensurePersistentStorage().then(() => isStoragePersisted().then(setPersisted));
  }, []);

  if (!settings) return null;

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
    if (cloud.user) void cloud.syncNow(true);
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
    if (cloud.user) {
      if (!navigator.onLine) {
        await alertDialog({ title: t('settings.resetAll'), message: t('settings.resetOffline') });
      } else {
        try { await cloud.wipeCloud(); } catch { /* ignore */ }
      }
    }
    await clearAllLocalData();
    window.location.reload();
  };

  return (
    <div className="anim-rise space-y-4 pb-4">
      <TopBar title={t('settings.title')} eyebrow={t('gt.profile')} onBack={() => navigate('/settings')} right={<SyncStatusBadge />} />

      {/* Preferences */}
      <section>
        <p className="ui-label mb-2 px-1">{t('settings.preferences')}</p>
        <div className="card py-1">
          <Row icon="globe" label={t('settings.language')}>
            <div className="seg" style={{ minWidth: 0 }}>
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

      {/* Reminders */}
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

      {/* Links */}
      <section className="space-y-2">
        <button type="button" onClick={() => navigate('/settings/videos')} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="video" size={18} /> {t('settings.videos')}</span>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
        <button type="button" onClick={() => navigate('/settings/import')} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="download" size={18} /> {t('settings.import')}</span>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
        <button type="button" onClick={() => void forceUpdate()} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="timer" size={18} /> {t('settings.forceUpdate')}</span>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
      </section>

      {/* Cloud */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">{t('settings.cloud')}</h2>
          <SyncStatusBadge />
        </div>
        {!cloud.available ? (
          <p className="text-sm text-earth-muted">{t('settings.localOnly')}</p>
        ) : cloud.user ? (
          <div className="space-y-2">
            {cloud.error ? (
              <p className="text-sm font-medium text-danger">
                <span className="flex items-center gap-1.5"><Icon name="close" size={16} /> {t('cloudState.error')}</span>
                <span className="mt-1 block break-words text-xs font-normal text-earth-muted">{cloud.error}</span>
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-brand">
                <Icon name="check" size={16} /> {cloud.syncing ? t('settings.syncing') : t('settings.synced')}
              </p>
            )}
            <p className="text-sm text-earth-muted">{cloud.user.email}</p>
            {cloud.lastSync && <p className="text-xs text-earth-subtle">{t('settings.lastSync')}: {new Date(cloud.lastSync).toLocaleTimeString()}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void cloud.syncNow(true)} disabled={cloud.syncing} className="btn-primary flex-1">{cloud.syncing ? '…' : t('settings.syncNow')}</button>
              <button type="button" onClick={() => void cloud.signOut()} className="btn-ghost flex-1">{t('settings.signOut')}</button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Data — danger zone */}
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
    </div>
  );
}
