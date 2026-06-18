import { useEffect, useState } from 'react';
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
import { shortDate } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-surface-raised'}`} role="switch" aria-checked={on}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'start-6' : 'start-1'}`} />
    </button>
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

  const [authOpen, setAuthOpen] = useState(false);
  const [creds, setCreds] = useState({ email: '', password: '' });
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
      <section className="card space-y-3">
        <h2 className="font-bold">{t('settings.preferences')}</h2>
        <div className="flex items-center justify-between">
          <span>{t('settings.language')}</span>
          <div className="flex gap-1">
            {(['en', 'ar'] as Locale[]).map((l) => (
              <button key={l} type="button" onClick={() => void setLocale(l)} className={`rounded-lg px-3 py-1.5 text-sm ${settings.locale === l ? 'bg-brand text-slate-950' : 'bg-surface-raised'}`}>
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.restDefault')}</span>
          <input className="input h-10 w-24 text-center" inputMode="numeric" value={settings.restDefaultSec} onChange={(e) => void updateSettings({ restDefaultSec: Number(e.target.value) || 0 })} />
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.weeklyGoal')}</span>
          <input className="input h-10 w-24 text-center" inputMode="numeric" value={settings.weeklyWorkoutGoal ?? 5} onChange={(e) => void updateSettings({ weeklyWorkoutGoal: Math.min(14, Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1)) })} />
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.keepAwake')}</span>
          <Toggle on={settings.keepAwakeDuringWorkout} onClick={() => void updateSettings({ keepAwakeDuringWorkout: !settings.keepAwakeDuringWorkout })} />
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.vibration')}</span>
          <Toggle on={settings.vibrationEnabled} onClick={() => void updateSettings({ vibrationEnabled: !settings.vibrationEnabled })} />
        </div>
        <div className="flex items-center justify-between">
          <span>{t('settings.notifications')}</span>
          <Toggle on={settings.notificationsEnabled} onClick={() => void (settings.notificationsEnabled ? updateSettings({ notificationsEnabled: false }) : enableNotifications())} />
        </div>
      </section>

      {/* Reminders */}
      <section className="card space-y-2">
        <h2 className="font-bold">{t('settings.reminders')}</h2>
        {reminders.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input type="time" value={r.time} onChange={(e) => void updateReminder({ ...r, time: e.target.value })} className="input h-10 w-28 py-1" />
            <span className="flex-1 truncate text-sm">{t(`reminderKinds.${r.kind}`)}</span>
            <Toggle on={r.enabled} onClick={() => void updateReminder({ ...r, enabled: !r.enabled })} />
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
        {!settings.notificationsEnabled && <p className="text-xs text-slate-500">{t('settings.enableNotifications')} ↑</p>}
        {settings.notificationsEnabled && !triggersAvailable && <p className="text-xs text-slate-500">{t('settings.notifWhileOpen')}</p>}
      </section>

      {/* Links */}
      <section className="space-y-2">
        <button type="button" onClick={() => navigate('/settings/videos')} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="video" size={18} /> {t('settings.videos')}</span>
          <Icon name="chevron" size={18} className="text-slate-500" />
        </button>
        <button type="button" onClick={() => navigate('/settings/import')} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="download" size={18} /> {t('settings.import')}</span>
          <Icon name="chevron" size={18} className="text-slate-500" />
        </button>
        <button type="button" onClick={() => void forceUpdate()} className="card flex w-full items-center justify-between">
          <span className="flex items-center gap-2"><Icon name="timer" size={18} /> {t('settings.forceUpdate')}</span>
          <Icon name="chevron" size={18} className="text-slate-500" />
        </button>
      </section>

      {/* Cloud */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">{t('settings.cloud')}</h2>
          <SyncStatusBadge />
        </div>
        {!cloud.available ? (
          <p className="text-sm text-slate-400">{t('settings.localOnly')}</p>
        ) : cloud.user ? (
          <div className="space-y-2">
            {cloud.error ? (
              <p className="text-sm font-medium text-danger">
                <span className="flex items-center gap-1.5"><Icon name="close" size={16} /> {t('cloudState.error')}</span>
                <span className="mt-1 block break-words text-xs font-normal text-slate-400">{cloud.error}</span>
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-brand">
                <Icon name="check" size={16} /> {cloud.syncing ? t('settings.syncing') : t('settings.synced')}
              </p>
            )}
            <p className="text-sm text-slate-300">{cloud.user.email}</p>
            {cloud.lastSync && <p className="text-xs text-slate-500">{t('settings.lastSync')}: {new Date(cloud.lastSync).toLocaleTimeString()}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void cloud.syncNow(true)} disabled={cloud.syncing} className="btn-primary flex-1">{cloud.syncing ? '…' : t('settings.syncNow')}</button>
              <button type="button" onClick={() => void cloud.signOut()} className="btn-ghost flex-1">{t('settings.signOut')}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAuthOpen(true)} className="btn-ghost mt-2 w-full">{t('settings.signIn')}</button>
        )}
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
          <span className="text-xs text-slate-400">{shortDate(selectedDay, settings.locale)}</span>
        </button>
        <button type="button" onClick={() => void resetAll()} className="btn-danger w-full text-sm">{t('settings.resetAll')}</button>
      </section>

      <Sheet open={authOpen} onClose={() => setAuthOpen(false)} title={t('settings.cloud')}>
        <div className="space-y-3">
          <input className="input" type="email" placeholder={t('settings.email')} value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} />
          <input className="input" type="password" placeholder={t('settings.password')} value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
          {cloud.error && <p className="text-sm text-danger">{cloud.error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void cloud.signIn(creds.email, creds.password, false).then((ok) => ok && setAuthOpen(false))} className="btn-primary flex-1">{t('settings.signIn')}</button>
            <button type="button" onClick={() => void cloud.signIn(creds.email, creds.password, true).then((ok) => ok && setAuthOpen(false))} className="btn-ghost flex-1">{t('settings.signUp')}</button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
