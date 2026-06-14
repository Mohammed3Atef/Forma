import { create } from 'zustand';
import type { Reminder, ReminderKind } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { recordDeletion } from '@/data/sync/tombstones';
import { today, uid } from '@/lib/utils';
import { useSettings } from '@/stores/settingsStore';

interface ReminderState {
  reminders: Reminder[];
  /** Reminder currently due and not dismissed — drives the in-app banner. */
  due: Reminder | null;
  intervalId: ReturnType<typeof setInterval> | null;
  load: () => Promise<void>;
  add: (kind: ReminderKind, time: string, label?: string) => Promise<void>;
  update: (reminder: Reminder) => Promise<void>;
  remove: (id: string) => Promise<void>;
  start: () => void;
  stop: () => void;
  dismissDue: () => void;
  requestPermission: () => Promise<boolean>;
}

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Does this browser support notifications that fire while the app is closed? */
function triggersSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'showTrigger' in Notification.prototype &&
    'TimestampTrigger' in window
  );
}

function granted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/** Next epoch-ms this reminder should fire (today if still ahead, else next valid day). */
function nextOccurrence(r: Reminder): number {
  const [h, m] = r.time.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  if (r.repeatDays.length > 0) {
    for (let i = 0; i < 8 && !r.repeatDays.includes(next.getDay()); i += 1) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next.getTime();
}

/**
 * Schedule OS-level notifications via the Notification Triggers API so they
 * fire even when the app is fully closed (Chrome/Android, installed PWA). Each
 * reminder's next occurrence is (re)scheduled on every change / app open.
 * Unsupported browsers (iOS Safari, Firefox) fall back to the in-app poller.
 */
async function scheduleTriggers(reminders: Reminder[]): Promise<void> {
  if (!triggersSupported() || !granted()) return;
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  // Clear previously scheduled reminder notifications.
  const existing = await reg.getNotifications({ includeTriggered: true } as never);
  for (const n of existing) if (n.tag?.startsWith('reminder:')) n.close();

  for (const r of reminders.filter((x) => x.enabled)) {
    await reg.showNotification('Gym Tracker', {
      body: r.label,
      tag: `reminder:${r.id}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // showTrigger is not yet in the TS DOM lib.
      showTrigger: new (window as unknown as { TimestampTrigger: new (t: number) => unknown })
        .TimestampTrigger(nextOccurrence(r)),
    } as NotificationOptions);
  }
}

async function fireNow(reminder: Reminder): Promise<void> {
  if (!granted()) return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification('Gym Tracker', {
        body: reminder.label,
        tag: `reminder-now:${reminder.id}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });
    } else {
      new Notification('Gym Tracker', { body: reminder.label });
    }
  } catch {
    /* fall back to in-app banner only */
  }
}

export const useReminders = create<ReminderState>((set, get) => ({
  reminders: [],
  due: null,
  intervalId: null,

  async load() {
    const reminders = await getDataSource().reminders.getAll();
    set({ reminders: reminders.sort((a, b) => a.time.localeCompare(b.time)) });
    void scheduleTriggers(get().reminders);
  },

  async add(kind, time, label) {
    const reminder: Reminder = {
      id: uid('rem'),
      kind,
      label: label ?? kind,
      time,
      enabled: true,
      repeatDays: [],
      updatedAt: Date.now(),
      dirty: true,
    };
    await getDataSource().reminders.put(reminder);
    set({ reminders: [...get().reminders, reminder].sort((a, b) => a.time.localeCompare(b.time)) });
    void scheduleTriggers(get().reminders);
  },

  async update(reminder) {
    const next = { ...reminder, updatedAt: Date.now(), dirty: true };
    await getDataSource().reminders.put(next);
    set({
      reminders: get()
        .reminders.map((r) => (r.id === next.id ? next : r))
        .sort((a, b) => a.time.localeCompare(b.time)),
    });
    void scheduleTriggers(get().reminders);
  },

  async remove(id) {
    await getDataSource().reminders.remove(id);
    await recordDeletion('reminders', id);
    set({ reminders: get().reminders.filter((r) => r.id !== id) });
    void scheduleTriggers(get().reminders);
  },

  start() {
    if (get().intervalId) return;
    const useTriggers = triggersSupported();
    const check = async () => {
      const hm = nowHM();
      const dow = new Date().getDay();
      const day = today();
      for (const r of get().reminders) {
        if (!r.enabled) continue;
        if (r.repeatDays.length > 0 && !r.repeatDays.includes(dow)) continue;
        // Fire when due OR overdue today (not only on an exact minute match —
        // background tabs get their timers throttled past the minute, which
        // used to silently skip the reminder for the whole day).
        if (r.time > hm) continue;
        if (r.lastFiredDate === day) continue;
        await get().update({ ...r, lastFiredDate: day });
        set({ due: { ...r, lastFiredDate: day } });
        // If the OS-triggered notification isn't supported, fire one now while
        // the app is open (and rely on the in-app banner regardless).
        if (!useTriggers && useSettings.getState().settings?.notificationsEnabled) {
          await fireNow(r);
        }
      }
    };
    void check();
    const id = setInterval(() => void check(), 30_000);
    set({ intervalId: id });
  },

  stop() {
    const id = get().intervalId;
    if (id) clearInterval(id);
    set({ intervalId: null });
  },

  dismissDue() {
    set({ due: null });
  },

  async requestPermission() {
    if (!('Notification' in window)) return false;
    const res = await Notification.requestPermission();
    const ok = res === 'granted';
    if (ok) void scheduleTriggers(get().reminders);
    return ok;
  },
}));
