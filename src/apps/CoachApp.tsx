import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ResponsiveShell } from '@/components/shell/ResponsiveShell';
import { CommandHost } from '@/components/CommandHost';
import { CoachPlanProvider, CoachPlanGate } from '@/components/coach/CoachPlanProvider';
import { CoachPlanBanner } from '@/components/coach/CoachPlanBanner';
import { COACH_NAV, COACH_SIDEBAR } from '@/config/nav';
import { useIsTabletUp } from '@/hooks/useMediaQuery';
import { queryClient } from '@/services/platform/queryClient';
import { RoleAccount } from '@/pages/RoleAccount';
import { CoachDashboard } from '@/pages/coach/CoachDashboard';
import { CoachClients } from '@/pages/coach/CoachClients';
import { CoachClientDetail } from '@/pages/coach/CoachClientDetail';
import { CoachClientActivity } from '@/pages/coach/CoachClientActivity';
import { CoachViewLayout } from '@/pages/coach/CoachViewLayout';
import { CoachCheckIns } from '@/pages/coach/CoachCheckIns';
import { CoachClientAssessment } from '@/pages/coach/CoachClientAssessment';
import { CoachAssessments } from '@/pages/coach/CoachAssessments';
import { CoachReports } from '@/pages/coach/CoachReports';
import { CoachPlan } from '@/pages/coach/CoachPlan';
import { CoachWorkoutEditor } from '@/pages/coach/CoachWorkoutEditor';
import { CoachNutritionEditor } from '@/pages/coach/CoachNutritionEditor';
import { CoachCardioEditor } from '@/pages/coach/CoachCardioEditor';
import { CoachTemplates } from '@/pages/coach/CoachTemplates';
import { CoachWorkoutTemplateEditor } from '@/pages/coach/CoachWorkoutTemplateEditor';
import { CoachExerciseLibrary } from '@/pages/coach/CoachExerciseLibrary';
import { PlanVersionHistory } from '@/pages/coach/PlanVersionHistory';
import { CoachAdherence } from '@/pages/coach/CoachAdherence';
import { CoachMessages } from '@/pages/coach/CoachMessages';
import { CoachMessageThread } from '@/pages/coach/CoachMessageThread';
import { Notifications } from '@/pages/Notifications';

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
      <Routes>
        <Route path="/coach" element={shell(<CoachIndex />)} />
        <Route path="/coach/dashboard" element={shell(<CoachDashboard />)} />
        <Route path="/coach/clients" element={shell(<CoachClients />)} />
        <Route path="/coach/assessments" element={shell(<CoachAssessments />)} />
        <Route path="/coach/reports" element={shell(<CoachReports />)} />
        <Route path="/coach/plan" element={shell(<CoachPlan />)} />
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
        <Route path="/coach/templates/:templateId" element={gated(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/adherence" element={shell(<CoachAdherence />)} />
        <Route path="/coach/messages" element={shell(<CoachMessages />)} />
        <Route path="/coach/messages/:clientId" element={shell(<CoachMessageThread />)} />
        <Route path="/coach/notifications" element={shell(<Notifications />)} />
        <Route path="/coach/settings" element={shell(<RoleAccount />)} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
      <CommandHost />
      </CoachPlanProvider>
    </QueryClientProvider>
  );
}
