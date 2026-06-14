import { useEffect, useState, type ReactNode } from 'react';
import { bootstrapData } from '@/data/bootstrap';
import { useSettings } from '@/stores/settingsStore';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useVideos } from '@/stores/videoStore';
import { useHabits } from '@/stores/habitStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useCloud } from '@/services/auth/cloudStore';
import { useSession } from '@/services/auth/sessionStore';
import { useDay } from '@/stores/dayStore';
import { useMeasurements } from '@/stores/measurementStore';
import { setupPersistentStorage } from '@/lib/storage';
import { initNative } from '@/lib/native';
import { DialogHost } from '@/components/DialogHost';
import { Splash } from '@/components/Splash';
import { ClientApp } from '@/apps/ClientApp';
import { CoachApp } from '@/apps/CoachApp';
import { AdminApp } from '@/apps/AdminApp';
import { Login } from '@/pages/auth/Login';
import { AccountPending } from '@/pages/auth/AccountPending';
import { AccountSuspended } from '@/pages/auth/AccountSuspended';

export function App() {
  const [ready, setReady] = useState(false);
  const selectedDay = useDay((s) => s.selected);
  const phase = useSession((s) => s.phase);
  const role = useSession((s) => s.account?.role ?? 'client');

  // When the focused day changes, reload all day-scoped data for that date.
  useEffect(() => {
    if (!ready) return;
    void useNutrition.getState().load(selectedDay);
    void useWorkout.getState().loadDay(selectedDay);
    void useHabits.getState().refresh(selectedDay);
  }, [selectedDay, ready]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await bootstrapData();
      await Promise.all([
        useSettings.getState().load(),
        useWorkout.getState().load(),
        useNutrition.getState().load(),
        useCardio.getState().load(),
        useVideos.getState().load(),
        useMeasurements.getState().load(),
      ]);
      await useHabits.getState().refresh();
      await useReminders.getState().load();
      useReminders.getState().start();
      useSession.getState().init(); // role / identity → drives routing
      useCloud.getState().init(); // client's own local-first cloud sync
      void initNative(); // native status bar + splash (Capacitor only)
      // Ask the OS not to evict our IndexedDB/CacheStorage data (login, videos,
      // photos). Retries on first user gesture if the browser defers the grant.
      setupPersistentStorage();
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
      useReminders.getState().stop();
    };
  }, []);

  if (!ready || phase === 'loading') return <Splash />;

  // Role-based routing: the session phase + role select which app mounts. Each
  // app owns its own <Routes> with absolute paths and a catch-all redirect.
  let body: ReactNode;
  if (phase === 'anonymous') body = <Login />;
  else if (phase === 'pending') body = <AccountPending />;
  else if (phase === 'suspended') body = <AccountSuspended />;
  else if (role === 'coach') body = <CoachApp />;
  else if (role === 'admin' || role === 'super_admin') body = <AdminApp />;
  else body = <ClientApp />;

  return (
    <>
      <DialogHost />
      {body}
    </>
  );
}
