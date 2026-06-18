import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { COACH_NAV } from '@/config/nav';
import { queryClient } from '@/services/platform/queryClient';
import { RoleAccount } from '@/pages/RoleAccount';
import { CoachClients } from '@/pages/coach/CoachClients';
import { CoachClientDetail } from '@/pages/coach/CoachClientDetail';
import { CoachClientActivity } from '@/pages/coach/CoachClientActivity';
import { CoachViewLayout } from '@/pages/coach/CoachViewLayout';
import { CoachCheckIns } from '@/pages/coach/CoachCheckIns';
import { CoachClientAssessment } from '@/pages/coach/CoachClientAssessment';
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

/**
 * Coach portal shell. Manages the coach's assigned clients (plans, targets,
 * notes, adherence, announcements). Online platform reads run through React
 * Query; client detail is a drill-down route.
 */
export function CoachApp() {
  const shell = (node: ReactNode) => <AppShell navItems={COACH_NAV}>{node}</AppShell>;
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/coach" element={shell(<CoachClients />)} />
        <Route path="/coach/client/:clientId" element={shell(<CoachClientDetail />)} />
        <Route path="/coach/client/:clientId/activity" element={shell(<CoachClientActivity />)} />
        <Route path="/coach/client/:clientId/view" element={shell(<CoachViewLayout />)} />
        <Route path="/coach/client/:clientId/view/:tab" element={shell(<CoachViewLayout />)} />
        <Route path="/coach/client/:clientId/assessment" element={shell(<CoachClientAssessment />)} />
        <Route path="/coach/client/:clientId/checkins" element={shell(<CoachCheckIns />)} />
        <Route path="/coach/client/:clientId/workout" element={shell(<CoachWorkoutEditor />)} />
        <Route path="/coach/client/:clientId/nutrition" element={shell(<CoachNutritionEditor />)} />
        <Route path="/coach/client/:clientId/cardio" element={shell(<CoachCardioEditor />)} />
        <Route path="/coach/client/:clientId/versions/:kind" element={shell(<PlanVersionHistory />)} />
        <Route path="/coach/library" element={shell(<CoachExerciseLibrary />)} />
        <Route path="/coach/templates" element={shell(<CoachTemplates />)} />
        <Route path="/coach/templates/:templateId" element={shell(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/adherence" element={shell(<CoachAdherence />)} />
        <Route path="/coach/messages" element={shell(<CoachMessages />)} />
        <Route path="/coach/messages/:clientId" element={shell(<CoachMessageThread />)} />
        <Route path="/coach/notifications" element={shell(<Notifications />)} />
        <Route path="/coach/settings" element={shell(<RoleAccount />)} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
