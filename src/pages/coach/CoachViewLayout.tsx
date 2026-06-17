import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { EntityNotesProvider, type NoteAnchorCtx } from '@/components/EntityNotes';
import { ClientActivityView } from '@/pages/coach/ClientActivityView';
import { CoachViewNutrition } from '@/pages/coach/CoachViewNutrition';
import { CoachViewMeasurements } from '@/pages/coach/CoachViewMeasurements';
import { CoachViewPhotos } from '@/pages/coach/CoachViewPhotos';
import { CoachViewProgress } from '@/pages/coach/CoachViewProgress';
import { useSession } from '@/services/auth/sessionStore';
import { addCoachNote, listCoachNotes, type Author } from '@/services/platform/coachApi';
import { fetchUser } from '@/services/platform/accountsApi';

const TABS = ['activity', 'nutrition', 'measurements', 'photos', 'progress'] as const;
type Tab = (typeof TABS)[number];

/**
 * Coach "view as client": navigable, read-only mirror of the client's app
 * (Activity / Nutrition / Measurements / Photos / Progress) with an inline
 * entity-anchored note affordance on every surface. The coach can also record
 * measurements (the only write path here).
 */
export function CoachViewLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '', tab = 'activity' } = useParams();
  const activeTab = (TABS.includes(tab as Tab) ? tab : 'activity') as Tab;
  const account = useSession((s) => s.account);
  const author: Author = { id: account?.id ?? 'self', role: account?.role ?? 'coach' };

  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const notesQ = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });
  const name = user.data?.displayName || user.data?.email || t('coach.client');

  // Add-note flow: an entity calls onAdd(ctx) → opens the sheet → addCoachNote(anchor).
  const [pending, setPending] = useState<NoteAnchorCtx | null>(null);
  const [body, setBody] = useState('');
  const addNote = useMutation({
    mutationFn: () =>
      addCoachNote(clientId, body.trim(), author, 'note', {
        screen: pending?.screen,
        date: pending?.date,
        entityType: pending?.entityType,
        entityId: pending?.entityId,
      }),
    onSuccess: () => {
      setBody('');
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['coachNotes', clientId] });
    },
  });

  return (
    <>
      <TopBar testId="coach-view" title={name} eyebrow={t('coachView.viewAsClient')} onBack={() => navigate(`/coach/client/${clientId}`)} />

      {/* Tab bar */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            data-testid={`coach-view-tab-${tb}`}
            onClick={() => navigate(`/coach/client/${clientId}/view/${tb}`)}
            className={`chip whitespace-nowrap ${activeTab === tb ? 'chip-on' : ''}`}
          >
            {t(`coachView.tabs.${tb}`)}
          </button>
        ))}
      </div>

      <EntityNotesProvider notes={notesQ.data ?? []} onAdd={(ctx) => { setBody(''); setPending(ctx); }}>
        {activeTab === 'activity' && <ClientActivityView clientId={clientId} />}
        {activeTab === 'nutrition' && <CoachViewNutrition clientId={clientId} />}
        {activeTab === 'measurements' && <CoachViewMeasurements clientId={clientId} />}
        {activeTab === 'photos' && <CoachViewPhotos clientId={clientId} />}
        {activeTab === 'progress' && <CoachViewProgress clientId={clientId} />}
      </EntityNotesProvider>

      <Sheet open={!!pending} onClose={() => setPending(null)} title={pending?.label ? t('notes.noteOn', { name: pending.label }) : t('coach.addNote')}>
        <textarea className="input min-h-28" data-testid="entity-note-body" placeholder={t('coach.notePlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="button" data-testid="entity-note-save" disabled={!body.trim() || addNote.isPending} onClick={() => addNote.mutate()} className="btn-primary mt-3 w-full disabled:opacity-40">
          {t('common.save')}
        </button>
      </Sheet>
    </>
  );
}
