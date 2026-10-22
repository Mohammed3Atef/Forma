import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlanEditorGate } from '@/components/coach/PlanEditorStates';
import { PlanEditorShell } from '@/components/coach/editor/PlanEditorShell';
import { PlanHistorySheet } from '@/components/coach/editor/PlanHistorySheet';
import { useHistoryParam } from '@/components/coach/editor/useHistoryParam';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { usePlanEditor } from '@/hooks/usePlanEditor';
import { useDailyTargetsEditor } from '@/hooks/useDailyTargetsEditor';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { ErrorState } from '@/components/ui/ErrorState';
import { confirmDelete } from '@/stores/dialogStore';
import { useSession } from '@/services/auth/sessionStore';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import { uid } from '@/lib/utils';
import { move } from '@/lib/workoutPlanModel';
import { getClientCardioPlan, saveClientCardioPlan } from '@/services/platform/planApi';
import type { CardioPlan, CardioSession, CardioType } from '@/types';
import { focusItem, rovingIndex } from '@/lib/rovingKeys';

const TYPES: CardioType[] = ['walking', 'treadmill', 'running', 'cycling', 'other'];

/** Working shape: a stored plan without its session list opens as empty (nothing written until saved). */
const normalizeCardio = (p: CardioPlan): CardioPlan => (Array.isArray(p.sessions) ? p : { ...p, sessions: [] });

function emptyPlan(): CardioPlan {
  return { id: uid('cplan'), name: '', sessions: [], updatedAt: Date.now() };
}

interface SessForm {
  orig: CardioSession | null;
  type: CardioType;
  durationMin: number | null;
  frequency: string;
  notes: string;
}
const formOf = (s: CardioSession | null): SessForm => ({ orig: s, type: s?.type ?? 'treadmill', durationMin: s?.durationMin ?? 30, frequency: s?.frequency ?? '', notes: s?.notes ?? '' });

/**
 * A client's cardio plan and daily movement targets (B3.5, blueprint §6.4; O-11, CO-19):
 * sessions (type, duration, frequency, notes) reorderable with confirmed deletes, and the steps /
 * cardio-minute targets the client already sees. One Save: the plan through compare-and-set
 * (`usePlanEditor`), then the targets through the server's per-field compare-and-set
 * (`useDailyTargetsEditor`, owner review B35-R2). Both keep a local draft (B35-R3).
 * Session notes stay one text, as the client app reads them (a bilingual field is a data-model change).
 */
export function CoachCardioEditor() {
  const { t } = useTranslation();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const client = useCoachClientHeader(clientId);
  const isDesktop = useIsDesktop();
  const ed = usePlanEditor<CardioPlan>({
    queryKey: 'clientCardioPlan',
    clientId,
    draftKey: `cardioDraft:${coachId}:${clientId}`,
    load: getClientCardioPlan,
    save: saveClientCardioPlan,
    empty: emptyPlan,
    normalize: normalizeCardio,
  });
  const { plan, setPlan, save } = ed;
  const [editing, setEditing] = useState<SessForm | null>(null);
  const [history, setHistory] = useHistoryParam(); // B3.9 (D10): ?history=1 opens it

  // Daily targets: their own read, draft and compare-and-set; a failed read only disables the targets.
  const tg = useDailyTargetsEditor({ clientId, coachId });
  const targets = tg.values;
  const targetsDirty = tg.dirty;

  const dirty = ed.dirty || targetsDirty;
  // Leaving (confirmed) discards both drafts — the plan's and the targets'.
  const discardDrafts = () => {
    ed.discardDraft();
    tg.clearDraft();
  };
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') }, discardDrafts);
  const exit = useBack(`/coach/client/${clientId}/plan`, discardDrafts);

  // Desktop keeps the first session open in the side panel.
  useEffect(() => {
    if (isDesktop && !editing && plan?.sessions.length) setEditing(formOf(plan.sessions[0]));
  }, [isDesktop, plan, editing]);

  const title = t('coachEditor.cardioTitle');
  if (!plan) {
    return (
      <PlanEditorShell testId="coach-cardio-editor" prefix="cardio" title={title} subtitle={client.name} onBack={exit}>
        {ed.status !== 'ready' && <PlanEditorGate status={ed.status} kind="cardio" onRetry={ed.retry} onCreate={ed.startNew} />}
      </PlanEditorShell>
    );
  }

  // The plan first (its own compare-and-set), then the changed targets. A failure or conflict in
  // either keeps that draft; nothing already saved is rolled back.
  const saveAll = async () => {
    try {
      if (ed.dirty || ed.creating || !targetsDirty) await save.mutateAsync({});
    } catch {
      return; /* the plan's conflict / failure is shown; the targets wait with it */
    }
    if (targetsDirty) await tg.save();
  };

  const saveSession = () => {
    if (!editing) return;
    const id = editing.orig?.id ?? uid('sess');
    const s: CardioSession = { ...(editing.orig ?? { id, type: editing.type, durationMin: 0, frequency: '', notes: '' }), id, type: editing.type, durationMin: Math.max(0, editing.durationMin ?? 0), frequency: editing.frequency.trim(), notes: editing.notes.trim() };
    setPlan((p) => ({ ...p, sessions: p.sessions.some((x) => x.id === id) ? p.sessions.map((x) => (x.id === id ? s : x)) : [...p.sessions, s] }));
    setEditing(isDesktop ? formOf(s) : null);
  };
  const removeSession = async (s: CardioSession) => {
    if (!(await confirmDelete(`${t(`cardio.types.${s.type}`, { defaultValue: t('cardio.types.other') })} · ${t('coachEditor.minutes', { n: s.durationMin })}`))) return;
    setPlan((p) => ({ ...p, sessions: p.sessions.filter((x) => x.id !== s.id) }));
    if (editing?.orig?.id === s.id) setEditing(null);
  };

  const sessionForm = editing && (
    <div className="space-y-4" data-testid="cardio-session-form">
      <div>
        <div className="label mb-1.5">{t('coachEditor.cardioType')}</div>
        <div className="flex flex-wrap gap-2" data-testid="cardio-type-options" role="radiogroup" aria-label={t('coachEditor.cardioType')}>
          {TYPES.map((ty, i) => (
            <button
              key={ty}
              type="button"
              role="radio"
              aria-checked={editing.type === ty}
              tabIndex={editing.type === ty ? 0 : -1}
              data-testid={`cardio-type-${ty}`}
              onClick={() => setEditing({ ...editing, type: ty })}
              // B3.9 (AX-05): one tab stop; arrows move the choice.
              onKeyDown={(e) => {
                const next = rovingIndex(e, i, TYPES.length, 'both');
                if (next < 0) return;
                e.preventDefault();
                focusItem(e, next, '[role="radio"]');
                setEditing({ ...editing, type: TYPES[next] });
              }}
              className={`chip min-h-ui-hit ${editing.type === ty ? 'chip-on' : ''}`}
            >
              {t(`cardio.types.${ty}`, { defaultValue: t('cardio.types.other') })}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumericField label={`${t('cardio.duration')} (${t('common.min')})`} testId="sess-duration" min={0} max={600} value={editing.durationMin} onChange={(v) => setEditing({ ...editing, durationMin: v })} />
        <TextInput label={t('coachEditor.frequency')} data-testid="sess-frequency" placeholder={t('coachEditor.frequencyPlaceholder')} value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })} dir="auto" />
      </div>
      <TextAreaField label={t('field.notes')} className="min-h-20" data-testid="sess-notes" placeholder={t('coachEditor.instructions')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} dir="auto" />
      <Button data-testid="sess-save" fullWidth onClick={saveSession}>
        {editing.orig ? t('coachEditor.applySession') : t('coachEditor.addSession')}
      </Button>
    </div>
  );

  const sessionList = (
    <section className="rounded-ui-surface border border-line-soft bg-surface-card p-4" data-testid="cardio-sessions">
      <h2 className="mb-1 text-[15px] font-semibold">{t('coachEditor.sessions')}</h2>
      <p className="mb-2 text-[12.5px] text-earth-subtle">{t('coachEditor.cardioHint')}</p>
      {plan.sessions.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-earth-muted">{t('coachEditor.noSessions')}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {plan.sessions.map((s, i) => {
            const label = `${t(`cardio.types.${s.type}`, { defaultValue: t('cardio.types.other') })} · ${t('coachEditor.minutes', { n: s.durationMin })}`;
            const active = isDesktop && editing?.orig?.id === s.id;
            return (
              <li key={s.id} className={`flex items-center gap-1 py-1.5 ${active ? 'rounded-ui-control bg-brand/10' : ''}`} data-testid="cardio-session-row">
                <button type="button" className="flex min-h-ui-hit min-w-0 flex-1 flex-col justify-center rounded-ui-control px-2 text-start hover:bg-surface-hover" aria-current={active ? 'true' : undefined} onClick={() => setEditing(formOf(s))}>
                  <span className="block truncate font-medium">{label}</span>
                  {(s.frequency || s.notes) && (
                    <span className="block truncate text-[12.5px] text-earth-subtle">
                      <bdi>{[s.frequency, s.notes].filter(Boolean).join(' · ')}</bdi>
                    </span>
                  )}
                </button>
                <IconButton icon="arrowUp" size="sm" label={t('coachEditor.moveSessionUp', { name: label })} disabled={i === 0} onClick={() => setPlan((p) => ({ ...p, sessions: move(p.sessions, i, -1) }))} className="border-transparent" />
                <IconButton icon="arrowDown" size="sm" label={t('coachEditor.moveSessionDown', { name: label })} disabled={i === plan.sessions.length - 1} onClick={() => setPlan((p) => ({ ...p, sessions: move(p.sessions, i, 1) }))} className="border-transparent" />
                <IconButton icon="trash" size="sm" label={t('coachEditor.deleteSession', { name: label })} onClick={() => void removeSession(s)} className="border-transparent text-danger" />
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" size="sm" icon="plus" data-testid="cardio-add-session" fullWidth className="mt-3" onClick={() => setEditing(formOf(null))}>
        {t('coachEditor.addSession')}
      </Button>
    </section>
  );

  const targetsCard = (
    <section className="rounded-ui-surface border border-line-soft bg-surface-card p-4" data-testid="cardio-targets">
      <h2 className="mb-1 text-[15px] font-semibold">{t('coachEditor.dailyMovement')}</h2>
      <p className="mb-3 text-[12.5px] text-earth-subtle">{t('coachEditor.dailyMovementHint')}</p>
      {tg.query.isError && !targets ? (
        <ErrorState message={t('coachEditor.targetsLoadFailed')} onRetry={() => void tg.query.refetch()} testId="cardio-targets-error" />
      ) : !targets ? (
        <p className="text-[13px] text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumericField label={t('coachEditor.stepsTarget')} testId="cardio-target-steps" integer min={0} max={100000} step={500} value={targets.steps} onChange={(v) => tg.setValue('steps', v)} />
          <NumericField label={t('coachEditor.cardioMinutesTarget')} testId="cardio-target-minutes" integer min={0} max={600} step={5} value={targets.cardioMin} onChange={(v) => tg.setValue('cardioMin', v)} />
        </div>
      )}
      {tg.conflict && targets && (
        <div className="mt-3 rounded-ui-control border border-warn/40 bg-warn/10 p-3" role="alert" data-testid="cardio-targets-conflict">
          <p className="text-sm font-semibold text-warn">{t('coachEditor.targetsConflictTitle')}</p>
          <p className="mt-1 text-[13px] text-earth-muted">{t('coachEditor.targetsConflictBody')}</p>
          <table className="mt-2 w-full text-[13px]">
            <thead>
              <tr className="text-start text-[12px] uppercase tracking-wide text-earth-subtle">
                <th className="py-1 text-start font-medium" scope="col">
                  <span className="sr-only">{t('coachEditor.target')}</span>
                </th>
                <th className="py-1 text-start font-medium" scope="col">{t('coachEditor.targetsYours')}</th>
                <th className="py-1 text-start font-medium" scope="col">{t('coachEditor.targetsNow')}</th>
              </tr>
            </thead>
            <tbody>
              {(['steps', 'cardioMin'] as const).map((k) => (
                <tr key={k}>
                  <th className="py-1 text-start font-normal" scope="row">{k === 'steps' ? t('coachEditor.stepsTarget') : t('coachEditor.cardioMinutesTarget')}</th>
                  <td className="py-1 tabular-nums" data-testid={`cardio-targets-mine-${k}`}>{targets[k] ?? '—'}</td>
                  <td className="py-1 tabular-nums" data-testid={`cardio-targets-theirs-${k}`}>{tg.conflict?.[k] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="tonal" data-testid="cardio-targets-keep-mine" pending={tg.saving} onClick={() => void tg.keepMine()}>
              {t('coachEditor.targetsKeepMine')}
            </Button>
            <Button size="sm" variant="ghost" data-testid="cardio-targets-use-theirs" disabled={tg.saving} onClick={() => void tg.takeTheirs()}>
              {t('coachEditor.targetsUseTheirs')}
            </Button>
          </div>
        </div>
      )}
      {tg.failed && (
        <p className="mt-2 text-sm text-danger" role="alert" data-testid="cardio-targets-failed">
          {t('coachEditor.targetsSaveFailed')}
        </p>
      )}
    </section>
  );

  const details = (
    <div className="space-y-3">
      <TextInput label={t('field.planName')} data-testid="cardio-plan-name" value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} placeholder={t('coachEditor.cardioNamePlaceholder')} dir="auto" />
      <ClientContextPanel clientId={clientId} />
    </div>
  );

  return (
    <PlanEditorShell
      testId="coach-cardio-editor"
      prefix="cardio"
      title={title}
      subtitle={client.name}
      onBack={exit}
      state={{
        saving: save.isPending || tg.saving,
        dirty,
        justSaved: ed.justSaved && !targetsDirty,
        conflict: ed.conflict || !!tg.conflict,
        saveFailed: save.isError || tg.failed,
        canSave: ed.canSave && !tg.saving && plan.name.trim().length > 0,
      }}
      onSave={() => void saveAll()}
      conflict={{ active: ed.conflict, onLoadLatest: () => void ed.reloadLatest(), onKeepMine: () => save.mutate({ overwrite: true }) }}
      draftRestored={ed.draftRestored || tg.draftRestored}
      draftStale={ed.draftStale || tg.draftStale}
      onDiscardDraft={() => {
        void ed.revertToSaved();
        void tg.discard();
      }}
      headerActions={
        <Button variant="ghost" size="sm" icon="list" data-testid="version-history" onClick={() => setHistory(true)}>
          <span className="hidden sm:inline">{t('planVersions.history')}</span>
          <span className="sr-only sm:hidden">{t('planVersions.history')}</span>
        </Button>
      }
    >
      {isDesktop ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {details}
            {targetsCard}
            {sessionList}
          </div>
          <div className="sticky top-4">
            {sessionForm ? (
              <section className="rounded-ui-surface border border-line-soft bg-surface-card p-4">
                <h2 className="mb-3 text-[15px] font-semibold">{editing?.orig ? t('coachEditor.session') : t('coachEditor.newSession')}</h2>
                {sessionForm}
              </section>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-ui-surface border border-dashed border-line py-10 text-center text-earth-subtle">
                <Icon name="activity" size={28} />
                <p className="text-sm">{t('coachEditor.selectSessionPrompt')}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {details}
          {targetsCard}
          {sessionList}
          <Sheet open={!!editing} onClose={() => setEditing(null)} size="md" title={editing?.orig ? t('coachEditor.session') : t('coachEditor.newSession')}>
            {sessionForm}
          </Sheet>
        </div>
      )}
      <PlanHistorySheet
        open={history}
        onClose={() => setHistory(false)}
        clientId={clientId}
        kind="cardio"
        dirty={ed.dirty}
        saving={save.isPending}
        canSave={ed.canSave && plan.name.trim().length > 0}
        onSaveVersion={(reason) => save.mutateAsync({ reason })}
        onRestored={() => ed.reloadLatest()}
      />
    </PlanEditorShell>
  );
}
