import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { showToast } from '@/stores/toastStore';
import { VersionActions } from '@/components/coach/VersionActions';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { confirmDelete } from '@/stores/dialogStore';
import { useSession } from '@/services/auth/sessionStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import { parseDecimal, uid } from '@/lib/utils';
import { getClientCardioPlan, saveClientCardioPlan } from '@/services/platform/planApi';
import type { CardioPlan, CardioSession, CardioType } from '@/types';

const TYPES: CardioType[] = ['walking', 'treadmill', 'running', 'cycling', 'other'];
const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

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
const blankSess = (): SessForm => ({ id: null, type: 'treadmill', durationMin: '30', frequency: '', notes: '' });

export function CoachCardioEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const draftKey = `cardioDraft:${clientId}`;

  const query = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const [plan, setPlan] = useState<CardioPlan | null>(null);
  // Dirty is COMPUTED vs the last-saved baseline (matches CoachWorkoutEditor's
  // pattern), so a leftover draft identical to the saved plan never false-prompts.
  const baselineRef = useRef<string>('');
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const [editing, setEditing] = useState<SessForm | null>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    // Wait for the query to actually settle before falling back to an empty
    // plan — otherwise the very first render (query.data still undefined
    // while loading) locks in an empty plan before the real saved plan has a
    // chance to arrive, and a coach reopening an existing client's cardio
    // plan would silently see it as blank (and could overwrite it on save).
    if (plan !== null || query.isLoading) return;
    void draftStore.getItem<CardioPlan>(draftKey).then((draft) => {
      const base = query.data ?? emptyPlan();
      baselineRef.current = JSON.stringify(base);
      setPlan(draft ?? base);
    });
  }, [query.isLoading, query.data, plan, draftKey]);

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') });

  // Autosave a local draft while there are unsaved changes — the same
  // protection CoachWorkoutEditor already has, so navigating away (any tab,
  // the workspace back button, a refresh) never actually loses the edits.
  useEffect(() => {
    if (plan && dirty) void draftStore.setItem(draftKey, plan);
  }, [plan, dirty, draftKey]);

  // Desktop: keep pane-b populated with the first session by default (matches
  // the Workout/Nutrition builders' split-pane behavior). Mobile never
  // auto-opens the edit sheet, so this is desktop-only.
  useEffect(() => {
    if (isDesktop && !editing && plan?.sessions.length) {
      const s = plan.sessions[0];
      setEditing({ id: s.id, type: s.type, durationMin: String(s.durationMin), frequency: s.frequency, notes: s.notes });
    }
  }, [isDesktop, plan, editing]);

  const save = useMutation({
    mutationFn: () => saveClientCardioPlan(clientId, plan!),
    onSuccess: async () => {
      await draftStore.removeItem(draftKey);
      baselineRef.current = JSON.stringify(plan);
      void qc.invalidateQueries({ queryKey: ['clientCardioPlan', clientId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      window.clearTimeout(savedTimer.current);
      setJustSaved(true);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 3000);
    },
  });

  const exit = useBack(`/coach/client/${clientId}`, () => void draftStore.removeItem(draftKey));

  if (!plan) {
    return (
      <>
        <TopBar testId="coach-cardio-editor" title={t('coachEditor.cardioTitle')} dense onBack={exit} />
        <LoadingState variant="list" count={4} />
      </>
    );
  }

  const saveSession = () => {
    if (!editing) return;
    const id = editing.id ?? uid('sess');
    const s: CardioSession = {
      id,
      type: editing.type,
      durationMin: Math.max(0, parseDecimal(editing.durationMin)),
      frequency: editing.frequency.trim(),
      notes: editing.notes.trim(),
    };
    setPlan({
      ...plan,
      sessions: plan.sessions.some((x) => x.id === id) ? plan.sessions.map((x) => (x.id === id ? s : x)) : [...plan.sessions, s],
    });
    // Desktop keeps pane-b showing the just-saved session; mobile closes the sheet.
    setEditing(isDesktop ? { ...editing, id } : null);
  };
  const removeSession = async (id: string, label?: string) => {
    if (!(await confirmDelete(label))) return;
    setPlan({ ...plan, sessions: plan.sessions.filter((s) => s.id !== id) });
  };
  const editSession = (s: CardioSession) => setEditing({ id: s.id, type: s.type, durationMin: String(s.durationMin), frequency: s.frequency, notes: s.notes });

  const sessionList = (
    <div className="card divide-y divide-line-soft">
      {plan.sessions.length ? (
        plan.sessions.map((s) => (
          <div key={s.id} className={`flex items-center gap-3 py-2.5 ${isDesktop && editing?.id === s.id ? 'text-brand' : ''}`}>
            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editSession(s)}>
              <span className="block truncate font-medium">{t(`cardio.types.${s.type}`)} · {s.durationMin} {t('common.min')}</span>
              <span className="block truncate text-[12px] text-earth-subtle">{[s.frequency, s.notes].filter(Boolean).join(' · ')}</span>
            </button>
            <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void removeSession(s.id, `${t(`cardio.types.${s.type}`)} · ${s.durationMin} ${t('common.min')}`)}>
              <Icon name="minus" size={18} />
            </button>
          </div>
        ))
      ) : (
        <p className="py-2 text-sm text-earth-muted">{t('coachEditor.noSessions')}</p>
      )}
    </div>
  );

  const sessionForm = editing && (
    <div className="space-y-3" data-testid="cardio-session-form">
      <div className="flex flex-wrap gap-2" data-testid="cardio-type-options">
        {TYPES.map((ty) => (
          <button key={ty} type="button" data-testid={`cardio-type-${ty}`} onClick={() => setEditing({ ...editing, type: ty })} className={`chip ${editing.type === ty ? 'chip-on' : ''}`}>
            {t(`cardio.types.${ty}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('cardio.duration')} ({t('common.min')})</label>
          <input className="input" data-testid="sess-duration" inputMode="decimal" value={editing.durationMin} onChange={(e) => setEditing({ ...editing, durationMin: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('coachEditor.frequency')}</label>
          <input className="input" data-testid="sess-frequency" placeholder={t('coachEditor.frequencyPlaceholder')} value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })} />
        </div>
      </div>
      <TextAreaField label={t('field.notes')} className="min-h-20" data-testid="sess-notes" placeholder={t('coachEditor.instructions')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
      <button type="button" data-testid="sess-save" onClick={saveSession} className="btn-primary w-full">
        {t('common.save')}
      </button>
    </div>
  );

  return (
    <>
      <TopBar
        testId="coach-cardio-editor"
        title={t('coachEditor.cardioTitle')}
        dense
        onBack={exit}
        right={
          <SubmitButton type="button" data-testid="cardio-save" pending={save.isPending} className="h-[42px] px-4 text-xs" onClick={() => save.mutate()}>
            {t('common.save')}
          </SubmitButton>
        }
      />

      <div className="mb-3"><ClientContextPanel clientId={clientId} /></div>

      {save.isPending ? (
        <p className="mb-3 text-[12px] text-earth-subtle" data-testid="cardio-saving">{t('settings.saving')}</p>
      ) : dirty ? (
        <p className="mb-3 text-[12px] text-warn" data-testid="cardio-unsaved">{t('coachEditor.unsavedIndicator')}</p>
      ) : justSaved ? (
        <p className="mb-3 text-[12px] text-success" data-testid="cardio-saved">{t('common.saved')}</p>
      ) : null}
      <p className="mb-3 text-[11.5px] text-earth-subtle">{t('coachEditor.saveHint')}</p>

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <TextInput label={t('field.planName')} fieldClassName="mb-2" data-testid="cardio-plan-name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.cardioNamePlaceholder')} />
      <div className="mb-3">
        <VersionActions clientId={clientId} kind="cardio" plan={plan} createdBy={coachId} />
      </div>
      <p className="mb-4 text-[13px] text-earth-muted">{t('coachEditor.cardioHint')}</p>

      {isDesktop ? (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="w-full shrink-0 space-y-3 lg:w-72">
            {sessionList}
            <button type="button" data-testid="cardio-add-session" className="btn-ghost w-full" onClick={() => setEditing(blankSess())}>
              {t('coachEditor.addSession')}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            {sessionForm || (
              <div className="card flex min-h-48 flex-col items-center justify-center gap-3 py-10 text-center text-earth-subtle">
                <Icon name="activity" size={28} />
                <p className="text-sm">{t('coachEditor.selectSessionPrompt')}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {sessionList}
          <button type="button" data-testid="cardio-add-session" className="btn-ghost mt-3 w-full" onClick={() => setEditing(blankSess())}>
            {t('coachEditor.addSession')}
          </button>
          <Sheet open={!!editing} onClose={() => setEditing(null)} size="md" title={t('coachEditor.session')}>
            {sessionForm}
          </Sheet>
        </>
      )}
    </>
  );
}
