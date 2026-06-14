import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { bootstrapData } from '@/data/bootstrap';
import { useSettings } from '@/stores/settingsStore';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useVideos } from '@/stores/videoStore';
import { useHabits } from '@/stores/habitStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useCloud } from '@/services/auth/cloudStore';
import { useDay } from '@/stores/dayStore';
import { useMeasurements } from '@/stores/measurementStore';
import { setupPersistentStorage } from '@/lib/storage';
import { AppShell } from '@/components/AppShell';
import { DialogHost } from '@/components/DialogHost';
import { Onboarding } from '@/components/Onboarding';
import { Splash } from '@/components/Splash';
import { Home } from '@/pages/Home';
import { Workout } from '@/pages/Workout';
import { RoutineDetail } from '@/pages/RoutineDetail';
import { ExerciseLibrary } from '@/pages/ExerciseLibrary';
import { ExerciseDetail } from '@/pages/ExerciseDetail';
import { WorkoutSession } from '@/pages/WorkoutSession';
import { Nutrition } from '@/pages/Nutrition';
import { Cardio } from '@/pages/Cardio';
import { Progress } from '@/pages/Progress';
import { History } from '@/pages/History';
import { ProgressPhotos } from '@/pages/ProgressPhotos';
import { Measurements } from '@/pages/Measurements';
import { Settings } from '@/pages/Settings';
import { VideoManager } from '@/pages/VideoManager';
import { ImportData } from '@/pages/ImportData';

export function App() {
  const [ready, setReady] = useState(false);
  const selectedDay = useDay((s) => s.selected);

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
      useCloud.getState().init();
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

  if (!ready) return <Splash />;

  return (
    <>
    <DialogHost />
    <Onboarding />
    <Routes>
      <Route path="/" element={<AppShell showDayNav><Home /></AppShell>} />
      <Route path="/workout" element={<AppShell><Workout /></AppShell>} />
      <Route path="/workout/routine/:dayId" element={<AppShell><RoutineDetail /></AppShell>} />
      <Route path="/workout/library" element={<AppShell><ExerciseLibrary /></AppShell>} />
      <Route path="/workout/exercise/:exId" element={<AppShell><ExerciseDetail /></AppShell>} />
      <Route path="/workout/session" element={<AppShell hideNav><WorkoutSession /></AppShell>} />
      <Route path="/nutrition" element={<AppShell showDayNav><Nutrition /></AppShell>} />
      <Route path="/cardio" element={<AppShell showDayNav><Cardio /></AppShell>} />
      <Route path="/progress" element={<AppShell><Progress /></AppShell>} />
      <Route path="/history" element={<AppShell><History /></AppShell>} />
      <Route path="/progress/photos" element={<AppShell><ProgressPhotos /></AppShell>} />
      <Route path="/progress/measurements" element={<AppShell showDayNav><Measurements /></AppShell>} />
      <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
      <Route path="/settings/videos" element={<AppShell><VideoManager /></AppShell>} />
      <Route path="/settings/import" element={<AppShell><ImportData /></AppShell>} />
      <Route path="*" element={<AppShell><Home /></AppShell>} />
    </Routes>
    </>
  );
}
