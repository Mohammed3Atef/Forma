import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { Sheet } from '@/components/Sheet';
import { useSession } from '@/services/auth/sessionStore';
import {
  addCoachNote,
  fetchClientLogs,
  fetchClientProfile,
  getCoachTargets,
  listCoachNotes,
  setCoachTargets,
  type Author,
} from '@/services/platform/coachApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { fetchUser } from '@/services/platform/accountsApi';
import { Icon, type IconName } from '@/components/Icon';
import type { WeightLog, WorkoutLog } from '@/types';

export function CoachClientDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const account = useSession((s) => s.account);
  const author: Author = { id: account?.id ?? 'self', role: account?.role ?? 'coach' };

  const [sheet, setSheet] = useState<'note' | 'targets' | 'manage' | null>(null);

  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const profile = useQuery({ queryKey: ['clientProfile', clientId], queryFn: () => fetchClientProfile(clientId), enabled: !!clientId });
  const workouts = useQuery({ queryKey: ['clientLogs', clientId, 'workoutLogs'], queryFn: () => fetchClientLogs<WorkoutLog>(clientId, 'workoutLogs', 10), enabled: !!clientId });
  const weights = useQuery({ queryKey: ['clientLogs', clientId, 'weightLogs'], queryFn: () => fetchClientLogs<WeightLog>(clientId, 'weightLogs', 1), enabled: !!clientId });
  const notes = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });
  const workoutPlan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const mealPlan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const cardioPlan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const targets = useQuery({ queryKey: ['coachTargets', clientId], queryFn: () => getCoachTargets(clientId), enabled: !!clientId });

  const plansCount = (workoutPlan.data ? 1 : 0) + (mealPlan.data ? 1 : 0);
  const finishedWorkouts = (workouts.data ?? []).filter((w) => w.finished).length;
  const lastWeight = weights.data?.[0]?.weightKg;

  const name = user.data?.displayName || user.data?.email || t('coach.client');

  return (
    <>
      <TopBar title={name} eyebrow={profile.data?.goal ? t(`settings.goals.${profile.data.goal}`) : t('platform.coachPortal')} onBack={() => navigate('/coach')} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="dumbbell" value={finishedWorkouts} label={t('coach.recentWorkouts')} />
        <StatTile icon="scale" value={lastWeight ?? '—'} unit={lastWeight ? t('common.kg') : undefined} label={t('coach.lastWeight')} />
        <StatTile icon="edit" value={notes.data?.length ?? 0} label={t('coach.notes')} />
        <StatTile icon="list" value={plansCount} label={t('coach.plans')} />
      </div>

      {/* Primary actions: view the client's activity, or manage their plan. */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => navigate(`/coach/client/${clientId}/activity`)} className="btn-primary">
          {t('activity.view')}
        </button>
        <button type="button" onClick={() => setSheet('manage')} className="btn-ghost">
          {t('coach.manage')}
        </button>
      </div>

      {/* Targets (read-only summary) */}
      <h2 className="h2 mb-2 mt-6">{t('coach.targets')}</h2>
      <div className="card">
        <div className="grid grid-cols-3 gap-3 text-center">
          <TargetCell label={t('coach.water')} value={targets.data?.waterMl} unit="ml" />
          <TargetCell label={t('coach.steps')} value={targets.data?.steps} />
          <TargetCell label={t('coach.cardio')} value={targets.data?.cardioMin} unit={t('common.min')} />
        </div>
      </div>

      {/* Latest notes preview */}
      <h2 className="h2 mb-2 mt-6">{t('coach.notes')}</h2>
      <div className="card divide-y divide-line-soft">
        {notes.data?.length ? (
          notes.data.slice(0, 3).map((n) => (
            <div key={n.id} className="py-3 first:pt-0 last:pb-0">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <span className="font-mono text-[10.5px] text-earth-subtle">{new Date(n.createdAt).toLocaleDateString()}</span>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-earth-muted">{t('coach.noNotes')}</p>
        )}
      </div>

      <ManageSheet
        open={sheet === 'manage'}
        onClose={() => setSheet(null)}
        workoutAssigned={!!workoutPlan.data}
        nutritionAssigned={!!mealPlan.data}
        cardioAssigned={!!cardioPlan.data}
        workoutName={workoutPlan.data?.name}
        nutritionName={mealPlan.data?.name}
        cardioCount={cardioPlan.data?.sessions.length ?? 0}
        onWorkout={() => navigate(`/coach/client/${clientId}/workout`)}
        onNutrition={() => navigate(`/coach/client/${clientId}/nutrition`)}
        onCardio={() => navigate(`/coach/client/${clientId}/cardio`)}
        onTargets={() => setSheet('targets')}
        onNote={() => setSheet('note')}
      />
      <NoteSheet open={sheet === 'note'} onClose={() => setSheet(null)} clientId={clientId} author={author} onSaved={() => void qc.invalidateQueries({ queryKey: ['coachNotes', clientId] })} />
      <TargetsSheet open={sheet === 'targets'} onClose={() => setSheet(null)} clientId={clientId} updatedBy={author.id} current={targets.data ?? null} onSaved={() => void qc.invalidateQueries({ queryKey: ['coachTargets', clientId] })} />
    </>
  );
}

function TargetCell({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div>
      <div className="stat-num text-2xl">
        {value ?? '—'}
        {value != null && unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function NoteSheet({ open, onClose, clientId, author, onSaved }: { open: boolean; onClose: () => void; clientId: string; author: Author; onSaved: () => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const mut = useMutation({
    mutationFn: () => addCoachNote(clientId, body.trim(), author),
    onSuccess: () => {
      setBody('');
      onSaved();
      onClose();
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('coach.addNote')}>
      <textarea className="input min-h-28" placeholder={t('coach.notePlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" disabled={!body.trim() || mut.isPending} onClick={() => mut.mutate()} className="btn-primary mt-3 w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </Sheet>
  );
}

function ManageSheet({
  open,
  onClose,
  workoutAssigned,
  nutritionAssigned,
  cardioAssigned,
  workoutName,
  nutritionName,
  cardioCount,
  onWorkout,
  onNutrition,
  onCardio,
  onTargets,
  onNote,
}: {
  open: boolean;
  onClose: () => void;
  workoutAssigned: boolean;
  nutritionAssigned: boolean;
  cardioAssigned: boolean;
  workoutName?: string;
  nutritionName?: string;
  cardioCount?: number;
  onWorkout: () => void;
  onNutrition: () => void;
  onCardio: () => void;
  onTargets: () => void;
  onNote: () => void;
}) {
  const { t } = useTranslation();
  // An assigned plan with a blank name still counts as assigned (don't fall
  // through to "no plan").
  const planSub = (assigned: boolean, name?: string) =>
    assigned ? name?.trim() || t('coach.planEdit') : t('coach.noPlanAssigned');
  const row = (icon: IconName, title: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="row w-full text-start">
      <span className="row-av bg-brand/15 text-brand">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-[13px] text-earth-muted">{sub}</span>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title={t('coach.manage')}>
      <div className="card divide-y divide-line-soft">
        {row('dumbbell', t('coach.kind.workout'), planSub(workoutAssigned, workoutName), onWorkout)}
        {row('meal', t('coach.kind.nutrition'), planSub(nutritionAssigned, nutritionName), onNutrition)}
        {row('activity', t('coach.kind.cardio'), cardioAssigned ? t('coach.sessionsCount', { n: cardioCount ?? 0 }) : t('coach.noPlanAssigned'), onCardio)}
        {row('target', t('coach.setTargets'), t('coach.targets'), onTargets)}
        {row('edit', t('coach.addNote'), t('coach.notes'), onNote)}
      </div>
    </Sheet>
  );
}

function TargetsSheet({ open, onClose, clientId, updatedBy, current, onSaved }: { open: boolean; onClose: () => void; clientId: string; updatedBy: string; current: { waterMl?: number; steps?: number; cardioMin?: number; calories?: number; protein?: number } | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    waterMl: current?.waterMl?.toString() ?? '',
    steps: current?.steps?.toString() ?? '',
    cardioMin: current?.cardioMin?.toString() ?? '',
    calories: current?.calories?.toString() ?? '',
    protein: current?.protein?.toString() ?? '',
  });
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const mut = useMutation({
    mutationFn: () =>
      setCoachTargets(
        clientId,
        { waterMl: num(form.waterMl), steps: num(form.steps), cardioMin: num(form.cardioMin), calories: num(form.calories), protein: num(form.protein) },
        updatedBy,
      ),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const field = (key: keyof typeof form, label: string) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" inputMode="numeric" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title={t('coach.setTargets')}>
      <div className="grid grid-cols-2 gap-3">
        {field('waterMl', `${t('coach.water')} (ml)`)}
        {field('steps', t('coach.steps'))}
        {field('cardioMin', `${t('coach.cardio')} (${t('common.min')})`)}
        {field('calories', t('nutrition.calories'))}
        {field('protein', t('nutrition.protein'))}
      </div>
      <button type="button" disabled={mut.isPending} onClick={() => mut.mutate()} className="btn-primary mt-4 w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </Sheet>
  );
}
