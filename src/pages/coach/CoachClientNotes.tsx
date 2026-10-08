import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextAreaField } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSession } from '@/services/auth/sessionStore';
import { addCoachNote, listCoachNotes, type Author } from '@/services/platform/coachApi';
import { NoteVisibilityBadge, NoteVisibilityToggle } from '@/components/NoteVisibility';
import { LoadingState } from '@/components/ui/LoadingState';
import type { NoteVisibility } from '@/types';
import { showToast } from '@/stores/toastStore';

/**
 * The workspace's `notes` tab — every internal coach note for this client, in
 * one place (previously only ever shown inline per-entity or as a 3-item
 * preview on Overview). Matches the design's dedicated `notes` tab exactly.
 */
export function CoachClientNotes() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const account = useSession((s) => s.account);
  const author: Author = { id: account?.id ?? 'self', role: account?.role ?? 'coach' };

  const notes = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('private');
  const openSheet = () => {
    setVisibility('private');
    add.reset();
    setOpen(true);
  };
  const add = useMutation({
    mutationFn: () => addCoachNote(clientId, body.trim(), author, 'note', undefined, visibility),
    onSuccess: () => {
      setBody('');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['coachNotes', clientId] });
      showToast({ title: t('common.saved'), variant: 'success' });
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="ui-label">{t('coach.notes')}</p>
        <button type="button" className="btn-tonal btn-sm" data-testid="coach-notes-add" onClick={openSheet}>
          <Icon name="plus" size={14} /> {t('coach.addNote')}
        </button>
      </div>
      {notes.isPending ? (
        <LoadingState variant="list" count={3} />
      ) : notes.isError ? (
        <div className="card text-sm" role="alert" data-testid="coach-notes-error">
          <p className="text-danger">{t('trust.notes.loadFailed')}</p>
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => void notes.refetch()}>{t('common.retry')}</button>
        </div>
      ) : !notes.data?.length ? (
        <EmptyState icon="edit" title={t('coach.noNotes')} action={<button type="button" className="btn-primary" onClick={openSheet}>{t('coach.addNote')}</button>} />
      ) : (
        <div className="card divide-y divide-line-soft">
          {notes.data.map((n) => (
            <div key={n.id} className="py-3 first:pt-0 last:pb-0">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-1 flex items-center gap-2">
                <NoteVisibilityBadge visibility={n.visibility} />
                <span className="font-mono text-[10.5px] text-earth-subtle">{new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} size="md" title={t('coach.addNote')}>
        <TextAreaField
          label={t('field.notes')}
          className="min-h-28"
          placeholder={t('coach.notePlaceholder')}
          value={body}
          data-testid="coach-note-body"
          onChange={(e) => setBody(e.target.value)}
        />
        <NoteVisibilityToggle value={visibility} onChange={setVisibility} />
        {add.isError && <p className="mt-2 text-sm text-danger" role="alert">{t('trust.notes.saveFailed')}</p>}
        <button type="button" data-testid="coach-note-save" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()} className="btn-primary mt-3 w-full disabled:opacity-40">
          {t('common.save')}
        </button>
      </Sheet>
    </div>
  );
}
