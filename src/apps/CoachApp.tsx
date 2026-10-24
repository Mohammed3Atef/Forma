import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CoachShell } from '@/components/coach/CoachShell';
import { CommandHost } from '@/components/CommandHost';
import { SiteIconSet } from '@/components/shared/siteIcons';
import { CoachPlanProvider, CoachPlanGate } from '@/components/coach/CoachPlanProvider';
import { CoachPlanBanner } from '@/components/coach/CoachPlanBanner';
import { BannerHost } from '@/components/BannerHost';
import { LoadingState } from '@/components/ui/LoadingState';
import { queryClient } from '@/services/platform/queryClient';
import { legacyViewTarget, versionsTarget } from '@/lib/coachWorkspace';
// Eager: lightweight shared pages (Clients is no longer the landing — Today is, since B3.1).
import { RoleAccount } from '@/pages/RoleAccount';
import { SignedInInterstitial } from '@/pages/auth/SignedInInterstitial';
import { CoachMe } from '@/pages/coach/CoachMe';

// Heavy coach route pages are lazy so the coach bundle stays small — the
// The plan editors in particular only load when an editor is opened.
const CoachToday = lazy(() => import('@/pages/coach/today/CoachToday').then((m) => ({ default: m.CoachToday })));
// B3.3: the directory shares the queue code with Today; lazy keeps both out of the shell chunk.
const CoachClients = lazy(() => import('@/pages/coach/CoachClients').then((m) => ({ default: m.CoachClients })));
// B3.4 client workspace: Summary · Plan · Progress · Profile.
const CoachClientWorkspaceLayout = lazy(() => import('@/components/coach/CoachClientWorkspaceLayout').then((m) => ({ default: m.CoachClientWorkspaceLayout })));
const WorkspaceSummary = lazy(() => import('@/pages/coach/workspace/WorkspaceSummary').then((m) => ({ default: m.WorkspaceSummary })));
const WorkspacePlan = lazy(() => import('@/pages/coach/workspace/WorkspacePlan').then((m) => ({ default: m.WorkspacePlan })));
const WorkspaceProgress = lazy(() => import('@/pages/coach/workspace/WorkspaceProgress').then((m) => ({ default: m.WorkspaceProgress })));
const WorkspaceProfile = lazy(() => import('@/pages/coach/workspace/WorkspaceProfile').then((m) => ({ default: m.WorkspaceProfile })));
const ProfileSection = lazy(() => import('@/pages/coach/workspace/WorkspaceProfile').then((m) => ({ default: m.ProfileSection })));
const CoachClientAssessment = lazy(() => import('@/pages/coach/CoachClientAssessment').then((m) => ({ default: m.CoachClientAssessment })));
const CoachPlan = lazy(() => import('@/pages/coach/CoachPlan').then((m) => ({ default: m.CoachPlan })));
const CoachWorkoutEditor = lazy(() => import('@/pages/coach/CoachWorkoutEditor').then((m) => ({ default: m.CoachWorkoutEditor })));
const CoachNutritionEditor = lazy(() => import('@/pages/coach/CoachNutritionEditor').then((m) => ({ default: m.CoachNutritionEditor })));
const CoachCardioEditor = lazy(() => import('@/pages/coach/CoachCardioEditor').then((m) => ({ default: m.CoachCardioEditor })));
// B3.7 Library: Programs · Exercises · Foods · Supplements; a template opens read-first in its editor (RM-27).
const CoachWorkoutTemplateEditor = lazy(() => import('@/pages/coach/CoachWorkoutTemplateEditor').then((m) => ({ default: m.CoachWorkoutTemplateEditor })));
const CoachLibrary = lazy(() => import('@/pages/coach/library/CoachLibrary').then((m) => ({ default: m.CoachLibrary })));
const CoachMessages = lazy(() => import('@/pages/coach/CoachMessages').then((m) => ({ default: m.CoachMessages })));
const CoachClientNotes = lazy(() => import('@/pages/coach/CoachClientNotes').then((m) => ({ default: m.CoachClientNotes })));
const CoachClientSubscriptionTab = lazy(() => import('@/pages/coach/CoachClientSubscriptionTab').then((m) => ({ default: m.CoachClientSubscriptionTab })));
const CoachClientHistory = lazy(() => import('@/pages/coach/CoachClientHistory').then((m) => ({ default: m.CoachClientHistory })));
const CoachBusiness = lazy(() => import('@/pages/coach/business/CoachBusiness').then((m) => ({ default: m.CoachBusiness })));

/**
 * Coach portal (B3.1): one `CoachShell` for every width — Today · Clients ·
 * Messages · Library, Me behind the avatar. `/coach` always opens Today
 * (`/coach/dashboard`) on every breakpoint (IA-K01); the URL itself stays the
 * same so stored links, the login landing and notifications keep working.
 * Online platform reads run through React Query; a client is a drill-down.
 *
 * B3.2: `/coach/dashboard` is Today (the queue). The assessments list and the
 * coach notification feed fold into it (blueprint §5.3, O-5) and redirect;
 * B3.3: the weekly check-ins page and the adherence ranking live in Clients
 * (`?view=checkins`, `?sort=workouts`); their old URLs redirect there.
 * B3.8: Revenue, Reports and Client Plans are one screen, Me › Business
 * (`/coach/business?tab=…`); their old URLs redirect there.
 */
export function CoachApp() {
  const shell = (node: ReactNode) => (
    <CoachShell
      banners={
        <>
          <CoachPlanBanner />
          <BannerHost />
        </>
      }
    >
      {node}
    </CoachShell>
  );
  // Write/edit surfaces are soft-gated: when the coach's plan has lapsed they
  // show a "renew to edit" notice instead of the editor (viewing stays open).
  const gated = (node: ReactNode) => shell(<CoachPlanGate>{node}</CoachPlanGate>);
  return (
    <QueryClientProvider client={queryClient}>
      <SiteIconSet>
      <CoachPlanProvider>
      <Suspense fallback={<div className="px-5 pt-6 md:px-6"><LoadingState variant="cards" count={4} /></div>}>
      <Routes>
        <Route path="/coach" element={<Navigate to="/coach/dashboard" replace />} />
        <Route path="/coach/me" element={shell(<CoachMe />)} />
        <Route path="/coach/dashboard" element={shell(<CoachToday />)} />
        <Route path="/coach/clients" element={shell(<CoachClients />)} />
        <Route path="/coach/assessments" element={<Navigate to="/coach/dashboard?focus=assessments" replace />} />
        <Route path="/coach/checkins" element={<Navigate to="/coach/clients?view=checkins" replace />} />
        <Route path="/coach/business" element={shell(<CoachBusiness />)} />
        {/* B3.8: Revenue, Reports and Client Plans are Me › Business now; their URLs keep working. */}
        <Route path="/coach/revenue" element={<Navigate to="/coach/business" replace />} />
        <Route path="/coach/reports" element={<Navigate to="/coach/business?tab=exports" replace />} />
        <Route path="/coach/subscription-plans" element={<Navigate to="/coach/business?tab=packages" replace />} />
        <Route path="/coach/plan" element={shell(<CoachPlan />)} />

        {/* B3.4 client workspace (blueprint §6.3): one header + Summary · Plan · Progress · Profile.
            Profile's sections and Progress › Check-ins keep the URLs stored notifications point at;
            the plan editors render without workspace chrome (full-screen tasks, B3.5 rebuilds them). */}
        <Route path="/coach/client/:clientId" element={shell(<CoachClientWorkspaceLayout />)}>
          <Route index element={<WorkspaceSummary />} />
          <Route path="plan" element={<WorkspacePlan />} />
          <Route path="progress" element={<WorkspaceProgress />} />
          <Route path="checkins" element={<WorkspaceProgress forcedView="checkins" />} />
          <Route path="profile" element={<WorkspaceProfile />} />
          <Route path="assessment" element={<ProfileSection><CoachClientAssessment /></ProfileSection>} />
          <Route path="notes" element={<ProfileSection><CoachClientNotes /></ProfileSection>} />
          <Route path="subscription" element={<ProfileSection><CoachClientSubscriptionTab /></ProfileSection>} />
          <Route path="history" element={<ProfileSection><CoachClientHistory /></ProfileSection>} />
          <Route path="workout" element={<CoachPlanGate><CoachWorkoutEditor /></CoachPlanGate>} />
          <Route path="nutrition" element={<CoachPlanGate><CoachNutritionEditor /></CoachPlanGate>} />
          <Route path="cardio" element={<CoachPlanGate><CoachCardioEditor /></CoachPlanGate>} />
        </Route>
        {/* The retired "view as client" pages live in Progress now (RM-20); their URLs redirect. */}
        <Route path="/coach/client/:clientId/view" element={<LegacyViewRedirect />} />
        <Route path="/coach/client/:clientId/view/:tab" element={<LegacyViewRedirect />} />
        {/* B3.9 (owner D10): the old version-history page is the editor's History sheet now — its URL redirects there
            (the editors stay behind the plan gate, B3-C02). */}
        <Route path="/coach/client/:clientId/versions/:kind" element={<VersionsRedirect />} />
        <Route path="/coach/library" element={shell(<CoachLibrary />)} />
        {/* B3.7: Templates is Library › Programs; the list URL redirects, the editor URLs stay.
            A template's own URL opens it read-first (viewing stays open when the coach's plan has lapsed). */}
        <Route path="/coach/templates" element={<Navigate to="/coach/library?tab=programs" replace />} />
        <Route path="/coach/templates/new" element={gated(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/templates/:templateId/edit" element={gated(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/templates/:templateId" element={shell(<CoachWorkoutTemplateEditor />)} />
        <Route path="/coach/adherence" element={<Navigate to="/coach/clients?sort=workouts" replace />} />
        {/* B3.6: one screen — the selection is the URL (split view ≥ 768, full-screen thread on phones). */}
        <Route path="/coach/messages" element={shell(<CoachMessages />)} />
        <Route path="/coach/messages/:clientId" element={shell(<CoachMessages />)} />
        <Route path="/coach/notifications" element={<Navigate to="/coach/dashboard" replace />} />
        <Route path="/coach/settings" element={shell(<RoleAccount />)} />
        {/* Anonymous-only links opened while signed in: explain instead of silently redirecting home. */}
        <Route path="/invite/:code" element={<SignedInInterstitial kind="invite" />} />
        <Route path="/reset/:token" element={<SignedInInterstitial kind="reset" />} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
      </Suspense>
      <CommandHost />
      </CoachPlanProvider>
      </SiteIconSet>
    </QueryClientProvider>
  );
}

/** `…/versions/:kind` (the retired version-history page) → that editor with History open (B3.9, D10). */
function VersionsRedirect() {
  const { clientId = '', kind } = useParams();
  return <Navigate to={versionsTarget(clientId, kind)} replace />;
}

/** `…/view`, `…/view/:tab` (the retired "view as client" pages) → the matching Progress view (B3.4). */
function LegacyViewRedirect() {
  const { clientId = '', tab } = useParams();
  return <Navigate to={legacyViewTarget(clientId, tab)} replace />;
}
