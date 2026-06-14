import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { uid } from '@/lib/utils';
import { getClientCardioPlan, saveClientCardioPlan } from '@/services/platform/planApi';
import type { CardioPlan, CardioSession, CardioType } from '@/types';

const TYPES: CardioType[] = ['walking', 'treadmill', 'running', 'cycling', 'other'];

function emptyPlan(): CardioPlan {
  return { id: uid('cplan'), name: '', sessions: [], updatedAt: Date.now() };
}

interface SessForm {
  id: string | null;
  type: CardioType;
  durationMin: string;
  frequency: string;
  notes: string;
}
const blankSess = (): SessForm => ({ id: null, type: 'treadmill', durationMin: '30', frequency: '3×/week', notes: '' });

export function CoachCardioEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();

  const query = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const [plan, setPlan] = useState<CardioPlan | null>(null);
  const [editing, setEditing] = useState<SessForm | null>(null);

  useEffect(() => {
    if (plan === null) setPlan(query.data ?? emptyPlan());
  }, [query.data, plan]);

  const save = useMutation({
    mutationFn: () => saveClientCardioPlan(clientId, plan!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clientCardioPlan', clientId] });
      navigate(`/coach/client/${clientId}`);
    },
  });

  if (!plan) return null;

  const saveSession = () => {
    if (!editing) return;
    const id = editing.id ?? uid('sess');
    const s: CardioSession = {
      id,
      type: editing.type,
      durationMin: Math.max(0, Number(editing.durationMin) || 0),
      frequency: editing.frequency.trim(),
      notes: editing.notes.trim(),
    };
    setPlan({
      ...plan,
      sessions: plan.sessions.some((x) => x.id === id) ? plan.sessions.map((x) => (x.id === id ? s : x)) : [...plan.sessions, s],
    });
    setEditing(null);
  };
  const removeSession = (id: string) => setPlan({ ...plan, sessions: plan.sessions.filter((s) => s.id !== id) });

  return (
    <>
      <TopBar
        title={t('coachEditor.cardioTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => navigate(`/coach/client/${clientId}`)}
        right={
          <button type="button" disabled={save.isPending} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('common.save')}
          </button>
        }
      />

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <input className="input mb-4" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.cardioNamePlaceholder')} />
      <p className="mb-4 text-[13px] text-earth-muted">{t('coachEditor.cardioHint')}</p>

      <div className="card divide-y divide-line-soft">
        {plan.sessions.length ? (
          plan.sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing({ id: s.id, type: s.type, durationMin: String(s.durationMin), frequency: s.frequency, notes: s.notes })}>
                <span className="block truncate font-medium">{t(`cardio.types.${s.type}`)} · {s.durationMin} {t('common.min')}</span>
                <span className="block truncate text-[12px] text-earth-subtle">{[s.frequency, s.notes].filter(Boolean).join(' · ')}</span>
              </button>
              <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => removeSession(s.id)}>
                <Icon name="minus" size={18} />
              </button>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-earth-muted">{t('coachEditor.noSessions')}</p>
        )}
      </div>
      <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setEditing(blankSess())}>
        {t('coachEditor.addSession')}
      </button>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('coachEditor.session')}>
        {editing && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((ty) => (
                <button key={ty} type="button" onClick={() => setEditing({ ...editing, type: ty })} className={`chip ${editing.type === ty ? 'chip-on' : ''}`}>
                  {t(`cardio.types.${ty}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t('cardio.duration')} ({t('common.min')})</label>
                <input className="input" inputMode="numeric" value={editing.durationMin} onChange={(e) => setEditing({ ...editing, durationMin: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('coachEditor.frequency')}</label>
                <input className="input" value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })} />
              </div>
            </div>
            <textarea className="input min-h-20" placeholder={t('coachEditor.instructions')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <button type="button" onClick={saveSession} className="btn-primary w-full">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
