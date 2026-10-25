import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { listMyClients } from '@/services/platform/coachApi';
import { LIBRARY_KEY } from '@/services/platform/libraryKeys';
import type { LibraryExerciseRow, LibraryFoodRow } from '@/services/platform/libraryApi';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { useCommandStore } from '@/stores/commandStore';
import { useSession } from '@/services/auth/sessionStore';
import { coachPlanState } from '@/services/platform/coachPlanApi';
import type { WorkoutTemplate } from '@/types';
import type { CoachPlan } from '@/types';
import type { CoachAdminData } from '@/services/platform/adminCoachesApi';

/**
 * Global command palette + search host (⌘K / Ctrl+K). Commands always show;
 * entities (clients, exercises, foods, templates, coaches) are searched over
 * data ALREADY in the React Query cache — no extra Firestore reads. Mount once
 * per role app, inside the Router + QueryClientProvider.
 */
export function CommandHost() {
  const { t } = useTranslation();
  // Every command goes through the unsaved-changes guard (NAV-K05 / DT-08): ⌘K must never drop an editor's work.
  const navigate = useGuardedNav();
  const qc = useQueryClient();
  const open = useCommandStore((s) => s.open);
  const hide = useCommandStore((s) => s.hide);
  const toggle = useCommandStore((s) => s.toggle);
  const role = useSession((s) => s.account?.role);
  const coachId = useSession((s) => s.account?.id ?? '');
  // DT-08: the client search covers the whole roster even on a cold start — the same light
  // roster query Today and Clients share (B3.3; it used to load the six-call dashboard).
  const roster = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: open && role === 'coach' && !!coachId });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const items = useMemo<CommandItem[]>(() => {
    if (!open) return [];
    const go = (to: string) => () => navigate(to);
    const cmd = t('search.commands');
    const cmds: CommandItem[] = [];
    const ents: CommandItem[] = [];

    if (role === 'coach') {
      // B3.8 (P2): with a lapsed / suspended Forma plan the coach app is read-only — no "create"
      // command is offered (the server would refuse it anyway).
      const lapsed = ['expired', 'suspended'].includes(coachPlanState(qc.getQueryData<CoachPlan>(['coachPlan', coachId]) ?? null));
      if (!lapsed) {
        cmds.push(
          { id: 'c-add-client', label: t('coachDash.addClient'), icon: 'plus', group: cmd, always: true, run: go('/coach/clients?new=1') },
          { id: 'c-create-template', label: t('coachDash.createTemplate'), icon: 'list', group: cmd, always: true, run: go('/coach/templates/new') },
          // B3.7 / DT-08: "New exercise / New food" open the creation form itself, not just the tab.
          { id: 'c-create-exercise', label: t('coachLib.newExercise'), icon: 'plus', group: cmd, always: true, run: go('/coach/library?tab=exercises&new=1') },
          { id: 'c-create-food', label: t('coachFoods.newFood'), icon: 'meal', group: cmd, always: true, run: go('/coach/library?tab=foods&new=1') },
        );
      }
      // B3.8: every section of the desktop sidebar, and every tab of Library and Business, by name.
      const nav = t('search.navigate');
      cmds.push(
        { id: 'c-today', label: t('coachNav.today'), icon: 'home', group: nav, always: true, run: go('/coach/dashboard') },
        { id: 'c-clients', label: t('coachNav.clients'), icon: 'users', group: nav, always: true, run: go('/coach/clients') },
        { id: 'c-open-library', label: t('coachDash.openLibrary'), icon: 'dumbbell', group: nav, always: true, run: go('/coach/library') },
        { id: 'c-lib-programs', label: `${t('coachNav.library')} › ${t('coachLib.tabs.programs')}`, icon: 'list', group: nav, run: go('/coach/library?tab=programs') },
        { id: 'c-lib-exercises', label: `${t('coachNav.library')} › ${t('coachLib.tabs.exercises')}`, icon: 'dumbbell', group: nav, run: go('/coach/library?tab=exercises') },
        { id: 'c-lib-foods', label: `${t('coachNav.library')} › ${t('coachLib.tabs.foods')}`, icon: 'meal', group: nav, run: go('/coach/library?tab=foods') },
        { id: 'c-lib-supplements', label: `${t('coachNav.library')} › ${t('coachLib.tabs.supplements')}`, icon: 'list', group: nav, run: go('/coach/library?tab=supplements') },
        { id: 'c-lib-groups', label: `${t('coachNav.library')} › ${t('library.views.groups')}`, icon: 'meal', group: nav, run: go('/coach/library?tab=foods&view=groups') },
        // Honest labels (DT-08): this opens the inbox — broadcasting is a step inside it.
        { id: 'c-messages', label: t('coachNav.openMessages'), icon: 'chat', group: cmd, always: true, run: go('/coach/messages') },
        { id: 'c-review-assess', label: t('coachDash.reviewAssessments'), icon: 'check', group: cmd, always: true, run: go('/coach/dashboard?focus=assessments') },
        // B3.8: Revenue and Reports are Me › Business; renewals and exports are tabs of it.
        { id: 'c-business', label: t('business.title'), icon: 'chart', group: cmd, always: true, keywords: t('business.commandKeywords'), run: go('/coach/business') },
        { id: 'c-renewals', label: t('business.commandRenewals'), icon: 'calendar', group: cmd, always: true, run: go('/coach/business?tab=renewals') },
        { id: 'c-packages', label: t('business.commandPackages'), icon: 'list', group: cmd, always: true, run: go('/coach/business?tab=packages') },
        { id: 'c-exports', label: `${t('business.title')} › ${t('business.tabs.exports')}`, icon: 'download', group: nav, run: go('/coach/business?tab=exports') },
        { id: 'c-forma', label: t('forma.myPlan'), icon: 'bolt', group: nav, always: true, run: go('/coach/plan') },
        { id: 'c-account', label: t('coachMe.accountRow'), icon: 'settings', group: nav, always: true, run: go('/coach/settings') },
        { id: 'c-me', label: t('coachNav.me'), icon: 'user', group: cmd, always: true, run: go('/coach/me') },
      );
      roster.data?.forEach((c) =>
        ents.push({ id: `cl-${c.id}`, label: c.displayName || c.email, icon: 'user', group: t('coach.clients'), keywords: c.email, run: go(`/coach/client/${c.id}`) }),
      );
      // B4.3: exercises and foods the coach has already listed (Forma's and their own, any page).
      const seen = new Set<string>();
      for (const [, data] of qc.getQueriesData<InfiniteData<{ items: LibraryExerciseRow[] }>>({ queryKey: [...LIBRARY_KEY, 'exercises'] }))
        for (const r of data?.pages.flatMap((p) => p.items) ?? []) {
          if (seen.has(`ex-${r.id}`)) continue;
          seen.add(`ex-${r.id}`);
          const name = r.kind === 'shared' ? r.card.name : { en: r.exercise.name, ar: r.exercise.names?.ar ?? '' };
          ents.push({ id: `ex-${r.id}`, label: name.en, icon: 'dumbbell', group: t('coachLib.tabs.exercises'), keywords: name.ar, run: go(`/coach/library?tab=exercises&open=${encodeURIComponent(r.id)}`) });
        }
      for (const [, data] of qc.getQueriesData<InfiniteData<{ items: LibraryFoodRow[] }>>({ queryKey: [...LIBRARY_KEY, 'foods'] }))
        for (const r of data?.pages.flatMap((p) => p.items) ?? []) {
          if (seen.has(`fd-${r.id}`)) continue;
          seen.add(`fd-${r.id}`);
          const name = r.kind === 'shared' ? r.card.name : r.food.name;
          ents.push({ id: `fd-${r.id}`, label: name.en, icon: 'meal', group: t('coachLib.tabs.foods'), keywords: name.ar ?? '', run: go(`/coach/library?tab=foods&open=${encodeURIComponent(r.id)}`) });
        }
      qc.getQueryData<WorkoutTemplate[]>(['workoutTemplates', coachId])?.forEach((tp) =>
        ents.push({ id: `tp-${tp.id}`, label: tp.name, icon: 'list', group: t('coachLib.tabs.programs'), run: go(`/coach/templates/${encodeURIComponent(tp.id)}`) }),
      );
    } else if (role === 'admin' || role === 'super_admin') {
      const isSuper = role === 'super_admin';
      cmds.push(
        { id: 'a-accounts', label: t('admin.accounts'), icon: 'user', group: cmd, always: true, run: go('/admin/accounts') },
        { id: 'a-assign', label: t('admin.assignments'), icon: 'target', group: cmd, always: true, run: go('/admin/assignments') },
        // Coaches / Subscriptions are super_admin-only screens (they redirect a
        // plain admin back to /admin) — never offer a command that dead-ends.
        ...(isSuper
          ? [
              { id: 'a-coaches', label: t('admin.coaches'), icon: 'trophy' as const, group: cmd, always: true, run: go('/admin/coaches') },
              { id: 'a-revenue', label: t('nav.adminSubscriptions'), icon: 'bolt' as const, group: cmd, always: true, run: go('/admin/subscriptions') },
            ]
          : []),
        { id: 'a-system', label: t('admin.governance'), icon: 'settings', group: cmd, always: true, run: go('/admin/governance') },
      );
      if (isSuper) {
        qc.getQueryData<CoachAdminData>(['coachAdmin'])?.rows.forEach((r) =>
          ents.push({ id: `co-${r.coach.id}`, label: r.coach.displayName || r.coach.email, icon: 'trophy', group: t('admin.coaches'), keywords: r.coach.email, run: go(`/admin/coaches/${r.coach.id}`) }),
        );
      }
    }
    return [...cmds, ...ents];
  }, [open, role, coachId, qc, navigate, t, roster.data]);

  return <CommandPalette open={open} onClose={hide} items={items} />;
}
