import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ClientShell } from '@/components/client/ClientShell';
import { SiteIconSet } from '@/components/client/siteIcons';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { ClientNotesProvider } from '@/components/ClientNotesProvider';
import { Onboarding } from '@/components/Onboarding';
import { Splash } from '@/components/Splash';
import { LoadingState } from '@/components/ui/LoadingState';
import { queryClient } from '@/services/platform/queryClient';
import { useSession } from '@/services/auth/sessionStore';
import { useAssessmentStatus } from '@/hooks/useAssessmentStatus';
import { loadCoachAssignedContent } from '@/services/platform/clientSync';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useSettings } from '@/stores/settingsStore';
import { useCardio } from '@/stores/cardioStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useHabits } from '@/stores/habitStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useDay } from '@/stores/dayStore';
import { useCoachContentSync } from '@/stores/coachContentStore';
// Eager: the landing route (`/`, the single most common first paint) + the
// gate/overlay components `ClientGate` itself renders outside `<Routes>`.
import { Home } from '@/pages/Home';
import { SignedInInterstitial } from '@/pages/auth/SignedInInterstitial';

// Every other client route is lazy — this used to import all ~20 pages
// eagerly into one `ClientApp` chunk (183KB) while Coach/Admin already
// lazy-load their own heavy routes; a client now only downloads the page(s)
// they actually visit.
const AssessmentWizard = lazy(() => import('@/pages/onboarding/AssessmentWizard').then((m) => ({ default: m.AssessmentWizard })));
const CoachUpdates = lazy(() => import('@/pages/CoachUpdates').then((m) => ({ default: m.CoachUpdates })));
const Workout = lazy(() => import('@/pages/Workout').then((m) => ({ default: m.Workout })));
const RoutineDetail = lazy(() => import('@/pages/RoutineDetail').then((m) => ({ default: m.RoutineDetail })));
const ExerciseDetail = lazy(() => import('@/pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));
const WorkoutSession = lazy(() => import('@/pages/WorkoutSession').then((m) => ({ default: m.WorkoutSession })));
const Nutrition = lazy(() => import('@/pages/Nutrition').then((m) => ({ default: m.Nutrition })));
const Cardio = lazy(() => import('@/pages/Cardio').then((m) => ({ default: m.Cardio })));
const Progress = lazy(() => import('@/pages/Progress').then((m) => ({ default: m.Progress })));
const History = lazy(() => import('@/pages/History').then((m) => ({ default: m.History })));
const Measurements = lazy(() => import('@/pages/Measurements').then((m) => ({ default: m.Measurements })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const ClientSubscriptionPage = lazy(() => import('@/pages/ClientSubscriptionPage').then((m) => ({ default: m.ClientSubscriptionPage })));
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
  // When the focused day changes, reload all day-scoped data for that date.
  // (Lives here, not in the root App, so other roles never bundle the client stores — B1.13 / AR-02.)
  const selectedDay = useDay((s) => s.selected);
  useEffect(() => {
    void useNutrition.getState().load(selectedDay);
    void useWorkout.getState().loadDay(selectedDay);
    void useHabits.getState().refresh(selectedDay);
  }, [selectedDay]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* The approved website glyphs for every client screen (B2 / doc 17). */}
      <SiteIconSet>
        <ClientGate />
      </SiteIconSet>
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
    if (!uid) return;
    let cancelled = false;
    const refresh = async () => {
      // The account's own local database is already open (accountRuntime);
      // mirror the coach-assigned plan/targets into it.
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
    // Lets screens offer a real Retry when the coach-content read failed (see coachContentStore).
    useCoachContentSync.getState().setRetry(() => void refresh());
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
      useCoachContentSync.getState().setRetry(null);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [submitted, uid]);

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
          {/* B2 client IA (doc 16): five tabs + You. URLs kept wherever they already
              point at the right place; the two retired pages redirect. Tab
              membership, Back and task-flow chrome come from config/clientNav. */}
          <Route path="/" element={<ClientShell><SubscriptionGate><Home /></SubscriptionGate></ClientShell>} />
          <Route path="/workout" element={<ClientShell><SubscriptionGate><Workout /></SubscriptionGate></ClientShell>} />
          <Route path="/workout/routine/:dayId" element={<ClientShell><SubscriptionGate><RoutineDetail /></SubscriptionGate></ClientShell>} />
          <Route path="/workout/exercise/:exId" element={<ClientShell><ExerciseDetail /></ClientShell>} />
          <Route path="/workout/session" element={<ClientShell><SubscriptionGate><WorkoutSession /></SubscriptionGate></ClientShell>} />
          <Route path="/workout/library" element={<Navigate to="/workout" replace />} />
          <Route path="/cardio" element={<ClientShell><SubscriptionGate><Cardio /></SubscriptionGate></ClientShell>} />
          <Route path="/history" element={<ClientShell><History /></ClientShell>} />
          <Route path="/nutrition" element={<ClientShell><SubscriptionGate><Nutrition /></SubscriptionGate></ClientShell>} />
          <Route path="/progress" element={<ClientShell><Progress /></ClientShell>} />
          <Route path="/progress/measurements" element={<ClientShell><Measurements /></ClientShell>} />
          <Route path="/messages" element={<ClientShell><Messages /></ClientShell>} />
          <Route path="/coach-notes" element={<ClientShell><CoachUpdates /></ClientShell>} />
          <Route path="/notifications" element={<Navigate to="/coach-notes" replace />} />
          <Route path="/check-ins" element={<ClientShell><CheckInHistory /></ClientShell>} />
          <Route path="/check-in/:id" element={<ClientShell><CheckIn /></ClientShell>} />
          <Route path="/assessment" element={<ClientShell><MyAssessment /></ClientShell>} />
          <Route path="/settings" element={<ClientShell><Settings /></ClientShell>} />
          <Route path="/settings/subscription" element={<ClientShell><ClientSubscriptionPage /></ClientShell>} />
          {/* Anonymous-only links opened while signed in: explain instead of silently redirecting home. */}
          <Route path="/invite/:code" element={<SignedInInterstitial kind="invite" />} />
          <Route path="/reset/:token" element={<SignedInInterstitial kind="reset" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ClientNotesProvider>
  );
}
