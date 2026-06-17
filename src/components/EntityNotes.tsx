import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { CoachNote, NoteEntityType, NoteScreen } from '@/types';

export interface NoteAnchorCtx {
  screen?: NoteScreen;
  date?: string;
  entityType: NoteEntityType;
  entityId: string;
  /** Human label of the anchored entity, for the add-note sheet title. */
  label?: string;
}

interface EntityNotesContextValue {
  notes: CoachNote[];
  /** When present (coach view), entities show an "add note" affordance. */
  onAdd?: (ctx: NoteAnchorCtx) => void;
}

const EntityNotesContext = createContext<EntityNotesContextValue>({ notes: [] });

/**
 * Supplies the coach notes for a client plus an optional add-handler. Wrap any
 * surface that renders `<EntityNotes>`: the client screens provide read-only
 * notes; the coach "view as client" provides notes + an `onAdd` that opens the
 * note sheet. Keeps `<EntityNotes>` API-agnostic (no coach/client bundle coupling).
 */
export function EntityNotesProvider({ notes, onAdd, children }: { notes: CoachNote[]; onAdd?: (ctx: NoteAnchorCtx) => void; children: ReactNode }) {
  return <EntityNotesContext.Provider value={{ notes, onAdd }}>{children}</EntityNotesContext.Provider>;
}

/**
 * Renders the coach notes anchored to (entityType, entityId) inline next to the
 * entity, plus an "add note" button when an `onAdd` handler is in context. Notes
 * are matched by stable entity id — never screen coordinates — so they stay
 * attached across devices, layouts and redesigns.
 */
export function EntityNotes({ entityType, entityId, screen, date, label }: NoteAnchorCtx) {
  const { t } = useTranslation();
  const { notes, onAdd } = useContext(EntityNotesContext);
  const mine = notes.filter((n) => n.entityType === entityType && n.entityId === entityId);
  if (mine.length === 0 && !onAdd) return null;
  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`entity-notes-${entityType}-${entityId}`}>
      {mine.map((n) => (
        <div key={n.id} className="flex items-start gap-1.5 rounded-lg border border-brand/25 bg-brand/5 px-2.5 py-1.5 text-[12.5px] text-earth-muted">
          <Icon name="info" size={13} className="mt-0.5 shrink-0 text-brand" />
          <span className="whitespace-pre-wrap">{n.body}</span>
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          data-testid={`add-note-${entityType}-${entityId}`}
          onClick={() => onAdd({ screen, date, entityType, entityId, label })}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-light"
        >
          <Icon name="edit" size={12} /> {t('notes.addNote')}
        </button>
      )}
    </div>
  );
}
