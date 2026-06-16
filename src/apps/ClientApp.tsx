import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Onboarding } from '@/components/Onboarding';
import { Splash } from '@/components/Splash';
import { queryClient } from '@/services/platform/queryClient';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { useAssessmentStatus } from '@/hooks/useAssessmentStatus';
import { AssessmentWizard } from '@/pages/onboarding/AssessmentWizard';
import { loadCoachAssignedContent, scopeLocalToUser } from '@/services/platform/clientSync';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useSettings } from '@/stores/settingsStore';
import { useCardio } from '@/stores/cardioStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useHabits } from '@/stores/habitStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useDay } from '@/stores/dayStore';
import { Home } from '@/pages/Home';
import { CoachInbox } from '@/pages/CoachInbox';
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

/**
 * The client experience — the original single-user tracker, unchanged. Mounted
 * for accounts whose role is `client` (and for local-only mode). Uses the
 * default client bottom-nav tabs.
 */
export function ClientApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClientGate />
    </QueryClientProvider>
  );
}

/**
 * Gates the client dashboard behind the mandatory onboarding assessment, and
 * mirrors coach-authored content into the local store. Runs inside the query
 * provider so the assessment status hook is available.
 */
function ClientGate() {
  const { enabled, isLoading, submitted, blocked } = useAssessmentStatus();
  const uid = useSession((s) => s.uid) ?? '';
  const displayName = useSession((s) => s.account?.displayName) ?? '';

  // Pull coach-authored content (plan, meals, targets, profile) into the local
  // store on mount, when the assessment becomes complete, and on refocus.
  useEffect(() => {
    if (!cloudAvailable()) return;
    if (!uid || uid === 'local-user') return;
    let cancelled = false;
    const refresh = async () => {
      // Isolate this device's local store to the current account, then mirror
      // the coach-assigned plan/targets in.
      await scopeLocalToUser(uid, displayName);
      await loadCoachAssignedContent(uid);
      if (cancelled) return;
      const day = useDay.getState().selected;
      await Promise.all([
        useSettings.getState().load(),
        useWorkout.getState().load(),
        useNutrition.getState().load(day),
        useCardio.getState().load(),
        useMeasurements.getState().load(),
        useReminders.getState().load(),
      ]);
      await useHabits.getState().refresh(day);
    };
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [submitted, uid, displayName]);

  // Mandatory onboarding gate (platform clients): block the dashboard until the
  // assessment is submitted, but only on a DEFINITIVE read (`blocked`) so an
  // offline/errored read never re-traps a returning client behind the wizard.
  // A coach `reset` flips it back and re-gates the app. Local-only mode keeps
  // the simple profile overlay.
  if (enabled && isLoading) return <Splash />;
  if (blocked) return <AssessmentWizard uid={uid} displayName={displayName} />;

  return (
    <>
      <Onboarding />
      <Routes>
        <Route path="/" element={<AppShell showDayNav><Home /></AppShell>} />
        <Route path="/coach-notes" element={<AppShell><CoachInbox /></AppShell>} />
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
