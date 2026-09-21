import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { ClientNotesProvider } from '@/components/ClientNotesProvider';
import { Onboarding } from '@/components/Onboarding';
import { Splash } from '@/components/Splash';
import { LoadingState } from '@/components/ui/LoadingState';
import { queryClient } from '@/services/platform/queryClient';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { useAssessmentStatus } from '@/hooks/useAssessmentStatus';
import { loadCoachAssignedContent, scopeLocalToUser } from '@/services/platform/clientSync';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useSettings } from '@/stores/settingsStore';
import { useCardio } from '@/stores/cardioStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useHabits } from '@/stores/habitStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useDay } from '@/stores/dayStore';
// Eager: the landing route (`/`, the single most common first paint) + the
// gate/overlay components `ClientGate` itself renders outside `<Routes>`.
import { Home } from '@/pages/Home';

// Every other client route is lazy — this used to import all ~20 pages
// eagerly into one `ClientApp` chunk (183KB) while Coach/Admin already
// lazy-load their own heavy routes; a client now only downloads the page(s)
// they actually visit.
const AssessmentWizard = lazy(() => import('@/pages/onboarding/AssessmentWizard').then((m) => ({ default: m.AssessmentWizard })));
const CoachInbox = lazy(() => import('@/pages/CoachInbox').then((m) => ({ default: m.CoachInbox })));
const Workout = lazy(() => import('@/pages/Workout').then((m) => ({ default: m.Workout })));
const RoutineDetail = lazy(() => import('@/pages/RoutineDetail').then((m) => ({ default: m.RoutineDetail })));
const ExerciseLibrary = lazy(() => import('@/pages/ExerciseLibrary').then((m) => ({ default: m.ExerciseLibrary })));
const ExerciseDetail = lazy(() => import('@/pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));
const WorkoutSession = lazy(() => import('@/pages/WorkoutSession').then((m) => ({ default: m.WorkoutSession })));
const Nutrition = lazy(() => import('@/pages/Nutrition').then((m) => ({ default: m.Nutrition })));
const Cardio = lazy(() => import('@/pages/Cardio').then((m) => ({ default: m.Cardio })));
const Progress = lazy(() => import('@/pages/Progress').then((m) => ({ default: m.Progress })));
const History = lazy(() => import('@/pages/History').then((m) => ({ default: m.History })));
const ProgressPhotos = lazy(() => import('@/pages/ProgressPhotos').then((m) => ({ default: m.ProgressPhotos })));
const Measurements = lazy(() => import('@/pages/Measurements').then((m) => ({ default: m.Measurements })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const ClientSettings = lazy(() => import('@/pages/ClientSettings').then((m) => ({ default: m.ClientSettings })));
const ClientSubscriptionPage = lazy(() => import('@/pages/ClientSubscriptionPage').then((m) => ({ default: m.ClientSubscriptionPage })));
const VideoManager = lazy(() => import('@/pages/VideoManager').then((m) => ({ default: m.VideoManager })));
const ImportData = lazy(() => import('@/pages/ImportData').then((m) => ({ default: m.ImportData })));
const Notifications = lazy(() => import('@/pages/Notifications').then((m) => ({ default: m.Notifications })));
const CheckIn = lazy(() => import('@/pages/CheckIn').then((m) => ({ default: m.CheckIn })));
const CheckInHistory = lazy(() => import('@/pages/CheckInHistory').then((m) => ({ default: m.CheckInHistory })));
const MyAssessment = lazy(() => import('@/pages/MyAssessment').then((m) => ({ default: m.MyAssessment })));
const Messages = lazy(() => import('@/pages/Messages').then((m) => ({ default: m.Messages })));

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
    // Both listeners exist because neither alone covers every "came back to
    // this app" case: `visibilitychange` fires when this tab is un-hidden
    // (switching tabs, restoring from the taskbar) but NOT when the browser
    // window merely loses/regains OS focus while staying visible (e.g. two
    // windows open side-by-side — coach in one, client in the other); `focus`
    // covers that but not the tab-switch case. There's no push/WebSocket layer
    // (Vercel serverless can't hold one), so this refetch-on-return is how the
    // client sees a coach's just-made change without a manual reload.
    let inFlight = false;
    const onReturn = () => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      void refresh().finally(() => {
        inFlight = false;
      });
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [submitted, uid, displayName]);

  // Mandatory onboarding gate (platform clients): block the dashboard until the
  // assessment is submitted, but only on a DEFINITIVE read (`blocked`) so an
  // offline/errored read never re-traps a returning client behind the wizard.
  // A coach `reset` flips it back and re-gates the app. Local-only mode keeps
  // the simple profile overlay.
  if (enabled && isLoading) return <Splash />;
  if (blocked) {
    return (
      <Suspense fallback={<Splash />}>
        <AssessmentWizard uid={uid} displayName={displayName} />
      </Suspense>
    );
  }

  return (
    <ClientNotesProvider>
      <Onboarding />
      <Suspense fallback={<div className="px-5 pt-6"><LoadingState variant="cards" count={4} /></div>}>
        <Routes>
          <Route path="/" element={<AppShell showDayNav><SubscriptionGate><Home /></SubscriptionGate></AppShell>} />
          <Route path="/coach-notes" element={<AppShell><CoachInbox /></AppShell>} />
          <Route path="/notifications" element={<AppShell><Notifications /></AppShell>} />
          <Route path="/check-in/:id" element={<AppShell><CheckIn /></AppShell>} />
          <Route path="/check-ins" element={<AppShell><CheckInHistory /></AppShell>} />
          <Route path="/assessment" element={<AppShell><MyAssessment /></AppShell>} />
          <Route path="/messages" element={<AppShell><Messages /></AppShell>} />
          <Route path="/workout" element={<AppShell><SubscriptionGate><Workout /></SubscriptionGate></AppShell>} />
          <Route path="/workout/routine/:dayId" element={<AppShell><SubscriptionGate><RoutineDetail /></SubscriptionGate></AppShell>} />
          <Route path="/workout/library" element={<AppShell><ExerciseLibrary /></AppShell>} />
          <Route path="/workout/exercise/:exId" element={<AppShell><ExerciseDetail /></AppShell>} />
          <Route path="/workout/session" element={<AppShell hideNav><SubscriptionGate><WorkoutSession /></SubscriptionGate></AppShell>} />
          <Route path="/nutrition" element={<AppShell showDayNav><SubscriptionGate><Nutrition /></SubscriptionGate></AppShell>} />
          <Route path="/cardio" element={<AppShell showDayNav><SubscriptionGate><Cardio /></SubscriptionGate></AppShell>} />
          <Route path="/progress" element={<AppShell><Progress /></AppShell>} />
          <Route path="/history" element={<AppShell><History /></AppShell>} />
          <Route path="/progress/photos" element={<AppShell><ProgressPhotos /></AppShell>} />
          <Route path="/progress/measurements" element={<AppShell showDayNav><Measurements /></AppShell>} />
          <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
          <Route path="/settings/app" element={<AppShell><ClientSettings /></AppShell>} />
          <Route path="/settings/subscription" element={<AppShell><ClientSubscriptionPage /></AppShell>} />
          <Route path="/settings/videos" element={<AppShell><VideoManager /></AppShell>} />
          <Route path="/settings/import" element={<AppShell><ImportData /></AppShell>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ClientNotesProvider>
  );
}
