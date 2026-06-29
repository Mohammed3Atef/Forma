import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ResponsiveShell } from '@/components/shell/ResponsiveShell';
import { CommandHost } from '@/components/CommandHost';
import { CoachPlanProvider, CoachPlanGate } from '@/components/coach/CoachPlanProvider';
import { CoachPlanBanner } from '@/components/coach/CoachPlanBanner';
import { LoadingState } from '@/components/ui/LoadingState';
import { COACH_NAV, COACH_SIDEBAR } from '@/config/nav';
import { useIsTabletUp } from '@/hooks/useMediaQuery';
import { queryClient } from '@/services/platform/queryClient';
// Eager: the landing list (mobile index) + lightweight shared pages.
import { CoachClients } from '@/pages/coach/CoachClients';
import { RoleAccount } from '@/pages/RoleAccount';
import { Notifications } from '@/pages/Notifications';

// Heavy coach route pages are lazy so the coach bundle stays small — the
// PlanBuilder editors in particular only load when an editor is opened.
const CoachDashboard = lazy(() => import('@/pages/coach/CoachDashboard').then((m) => ({ default: m.CoachDashboard })));
const CoachClientDetail = lazy(() => import('@/pages/coach/CoachClientDetail').then((m) => ({ default: m.CoachClientDetail })));
const CoachClientActivity = lazy(() => import('@/pages/coach/CoachClientActivity').then((m) => ({ default: m.CoachClientActivity })));
const CoachViewLayout = lazy(() => import('@/pages/coach/CoachViewLayout').then((m) => ({ default: m.CoachViewLayout })));
const CoachCheckIns = lazy(() => import('@/pages/coach/CoachCheckIns').then((m) => ({ default: m.CoachCheckIns })));
const CoachClientAssessment = lazy(() => import('@/pages/coach/CoachClientAssessment').then((m) => ({ default: m.CoachClientAssessment })));
const CoachAssessments = lazy(() => import('@/pages/coach/CoachAssessments').then((m) => ({ default: m.CoachAssessments })));
const CoachReports = lazy(() => import('@/pages/coach/CoachReports').then((m) => ({ default: m.CoachReports })));
const CoachPlan = lazy(() => import('@/pages/coach/CoachPlan').then((m) => ({ default: m.CoachPlan })));
const CoachSubscriptionPlans = lazy(() => import('@/pages/coach/CoachSubscriptionPlans').then((m) => ({ default: m.CoachSubscriptionPlans })));
const CoachWorkoutEditor = lazy(() => import('@/pages/coach/CoachWorkoutEditor').then((m) => ({ default: m.CoachWorkoutEditor })));
const CoachNutritionEditor = lazy(() => import('@/pages/coach/CoachNutritionEditor').then((m) => ({ default: m.CoachNutritionEditor })));
const CoachCardioEditor = lazy(() => import('@/pages/coach/CoachCardioEditor').then((m) => ({ default: m.CoachCardioEditor })));
const CoachTemplates = lazy(() => import('@/pages/coach/CoachTemplates').then((m) => ({ default: m.CoachTemplates })));
const CoachWorkoutTemplateEditor = lazy(() => import('@/pages/coach/CoachWorkoutTemplateEditor').then((m) => ({ default: m.CoachWorkoutTemplateEditor })));
const CoachTemplatePreview = lazy(() => import('@/pages/coach/CoachTemplatePreview').then((m) => ({ default: m.CoachTemplatePreview })));
const CoachExerciseLibrary = lazy(() => import('@/pages/coach/CoachExerciseLibrary').then((m) => ({ default: m.CoachExerciseLibrary })));
const PlanVersionHistory = lazy(() => import('@/pages/coach/PlanVersionHistory').then((m) => ({ default: m.PlanVersionHistory })));
const CoachAdherence = lazy(() => import('@/pages/coach/CoachAdherence').then((m) => ({ default: m.CoachAdherence })));
const CoachMessages = lazy(() => import('@/pages/coach/CoachMessages').then((m) => ({ default: m.CoachMessages })));
const CoachMessageThread = lazy(() => import('@/pages/coach/CoachMessageThread').then((m) => ({ default: m.CoachMessageThread })));

/** `/coach` landing: dashboard on tablet/desktop, clients list on mobile. */
function CoachIndex() {
  const tabletUp = useIsTabletUp();
  return tabletUp ? <Navigate to="/coach/dashboard" replace /> : <CoachClients />;
}

/**
 * Coach portal shell. Responsive: mobile keeps the bottom-nav experience;
 * tablet/desktop get a sidebar + dashboard (see ResponsiveShell). Online
 * platform reads run through React Query; client detail is a drill-down route.
 */
export function CoachApp() {
  const shell = (node: ReactNode) => (
    <ResponsiveShell navItems={COACH_NAV} sidebarItems={COACH_SIDEBAR}>
      <CoachPlanBanner />
      {node}
    </ResponsiveShell>
  );
  // Write/edit surfaces are soft-gated: when the coach's plan has lapsed they
  // show a "renew to edit" notice instead of the editor (viewing stays open).
  const gated = (node: ReactNode) => shell(<CoachPlanGate>{node}</CoachPlanGate>);
  return (
    <QueryClientProvider client={queryClient}>
      <CoachPlanProvider>
      <Suspense fallback={<div className="px-5 pt-6 md:px-6"><LoadingState variant="cards" count={4} /></div>}>
      <Routes>
        <Route path="/coach" element={shell(<CoachIndex />)} />
        <Route path="/coach/dashboard" element={shell(<CoachDashboard />)} />
        <Route path="/coach/clients" element={shell(<CoachClients />)} />
        <Route path="/coach/assessments" element={shell(<CoachAssessments />)} />
        <Route path="/coach/reports" element={shell(<CoachReports />)} />
        <Route path="/coach/plan" element={shell(<CoachPlan />)} />
        <Route path="/coach/subscription-plans" element={shell(<CoachSubscriptionPlans />)} />
        <Route path="/coach/client/:clientId" element={shell(<CoachClientDetail />)} />
        <Route path="/coach/client/:clientId/activity" element={shell(<CoachClientActivity />)} />
        <Route path="/coach/client/:clientId/view" element={shell(<CoachViewLayout />)} />
        <Route path="/coach/client/:clientId/view/:tab" element={shell(<CoachViewLayout />)} />
        <Route path="/coach/client/:clientId/assessment" element={shell(<CoachClientAssessment />)} />
        <Route path="/coach/client/:clientId/checkins" element={shell(<CoachCheckIns />)} />
        <Route path="/coach/client/:clientId/workout" element={gated(<CoachWorkoutEditor />)} />
        <Route path="/coach/client/:clientId/nutrition" element={gated(<CoachNutritionEditor />)} />
        <Route path="/coach/client/:clientId/cardio" element={gated(<CoachCardioEditor />)} />
        <Route path="/coach/client/:clientId/versions/:kind" element={shell(<PlanVersionHistory />)} />
        <Route path="/coach/library" element={shell(<CoachExerciseLibrary />)} />
        <Route path="/coach/templates" element={shell(<CoachTemplates />)} />
        <Route path="/coach/templates/new" element={gated(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/templates/:templateId/edit" element={gated(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/templates/:templateId" element={shell(<CoachTemplatePreview />)} />
        <Route path="/coach/adherence" element={shell(<CoachAdherence />)} />
        <Route path="/coach/messages" element={shell(<CoachMessages />)} />
        <Route path="/coach/messages/:clientId" element={shell(<CoachMessageThread />)} />
        <Route path="/coach/notifications" element={shell(<Notifications />)} />
        <Route path="/coach/settings" element={shell(<RoleAccount />)} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
      </Suspense>
      <CommandHost />
      </CoachPlanProvider>
    </QueryClientProvider>
  );
}
