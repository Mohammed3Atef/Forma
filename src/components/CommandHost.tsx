import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { useCommandStore } from '@/stores/commandStore';
import { useSession } from '@/services/auth/sessionStore';
import type { Exercise, LibraryFood, WorkoutTemplate } from '@/types';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import type { CoachAdminData } from '@/services/platform/adminCoachesApi';

/**
 * Global command palette + search host (⌘K / Ctrl+K). Commands always show;
 * entities (clients, exercises, foods, templates, coaches) are searched over
 * data ALREADY in the React Query cache — no extra Firestore reads. Mount once
 * per role app, inside the Router + QueryClientProvider.
 */
export function CommandHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = useCommandStore((s) => s.open);
  const hide = useCommandStore((s) => s.hide);
  const toggle = useCommandStore((s) => s.toggle);
  const role = useSession((s) => s.account?.role);
  const coachId = useSession((s) => s.account?.id ?? '');

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
      cmds.push(
        { id: 'c-add-client', label: t('coachDash.addClient'), icon: 'plus', group: cmd, always: true, run: go('/coach/clients?new=1') },
        { id: 'c-create-template', label: t('coachDash.createTemplate'), icon: 'list', group: cmd, always: true, run: go('/coach/templates/new') },
        { id: 'c-open-library', label: t('coachDash.openLibrary'), icon: 'dumbbell', group: cmd, always: true, run: go('/coach/library') },
        { id: 'c-create-exercise', label: t('coachLib.newExercise'), icon: 'plus', group: cmd, always: true, run: go('/coach/library?tab=exercises') },
        { id: 'c-create-food', label: t('coachFoods.newFood'), icon: 'meal', group: cmd, always: true, run: go('/coach/library?tab=foods') },
        { id: 'c-broadcast', label: t('coachDash.sendBroadcast'), icon: 'chat', group: cmd, always: true, run: go('/coach/messages') },
        { id: 'c-review-assess', label: t('coachDash.reviewAssessments'), icon: 'check', group: cmd, always: true, run: go('/coach/assessments') },
        { id: 'c-reports', label: t('coachDash.tabs.reports'), icon: 'chart', group: cmd, always: true, run: go('/coach/dashboard?tab=reports') },
      );
      qc.getQueryData<CoachDashboard>(['coachDashboard', coachId])?.clients.forEach((r) =>
        ents.push({ id: `cl-${r.client.id}`, label: r.client.displayName || r.client.email, icon: 'user', group: t('coach.clients'), keywords: r.client.email, run: go(`/coach/client/${r.client.id}`) }),
      );
      qc.getQueryData<Exercise[]>(['exerciseLibrary', coachId])?.forEach((e) =>
        ents.push({ id: `ex-${e.id}`, label: e.name, icon: 'dumbbell', group: t('coachLib.tabs.exercises'), keywords: `${e.targetMuscle} ${e.category ?? ''}`, run: go('/coach/library?tab=exercises') }),
      );
      qc.getQueryData<LibraryFood[]>(['foods', coachId])?.forEach((f) =>
        ents.push({ id: `fd-${f.id}`, label: f.name.en, icon: 'meal', group: t('coachLib.tabs.foods'), run: go('/coach/library?tab=foods') }),
      );
      qc.getQueryData<WorkoutTemplate[]>(['workoutTemplates', coachId])?.forEach((tp) =>
        ents.push({ id: `tp-${tp.id}`, label: tp.name, icon: 'list', group: t('coachDash.templates'), run: go(`/coach/templates/${tp.id}`) }),
      );
    } else if (role === 'admin' || role === 'super_admin') {
      cmds.push(
        { id: 'a-accounts', label: t('admin.accounts'), icon: 'user', group: cmd, always: true, run: go('/admin/accounts') },
        { id: 'a-assign', label: t('admin.assignments'), icon: 'target', group: cmd, always: true, run: go('/admin/assignments') },
        { id: 'a-coaches', label: t('admin.tabs.coaches'), icon: 'trophy', group: cmd, always: true, run: go('/admin?tab=coaches') },
        { id: 'a-revenue', label: t('admin.tabs.revenue'), icon: 'bolt', group: cmd, always: true, run: go('/admin?tab=revenue') },
        { id: 'a-system', label: t('admin.tabs.system'), icon: 'settings', group: cmd, always: true, run: go('/admin?tab=system') },
      );
      qc.getQueryData<CoachAdminData>(['coachAdmin'])?.rows.forEach((r) =>
        ents.push({ id: `co-${r.coach.id}`, label: r.coach.displayName || r.coach.email, icon: 'trophy', group: t('admin.coaches'), keywords: r.coach.email, run: go(`/admin/coaches/${r.coach.id}`) }),
      );
    }
    return [...cmds, ...ents];
  }, [open, role, coachId, qc, navigate, t]);

  return <CommandPalette open={open} onClose={hide} items={items} />;
}
