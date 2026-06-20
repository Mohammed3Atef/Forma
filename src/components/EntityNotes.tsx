import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/Icon";
import { useFocus } from "@/stores/focusStore";
import type { CoachNote, NoteEntityType, NoteScreen } from "@/types";

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

const EntityNotesContext = createContext<EntityNotesContextValue>({
  notes: [],
});

/**
 * Supplies the coach notes for a client plus an optional add-handler. Wrap any
 * surface that renders `<EntityNotes>`: the client screens provide read-only
 * notes; the coach "view as client" provides notes + an `onAdd` that opens the
 * note sheet. Keeps `<EntityNotes>` API-agnostic (no coach/client bundle coupling).
 */
export function EntityNotesProvider({
  notes,
  onAdd,
  children,
}: {
  notes: CoachNote[];
  onAdd?: (ctx: NoteAnchorCtx) => void;
  children: ReactNode;
}) {
  return (
    <EntityNotesContext.Provider value={{ notes, onAdd }}>
      {children}
    </EntityNotesContext.Provider>
  );
}

/**
 * Renders the coach notes anchored to (entityType, entityId) inline next to the
 * entity, plus an "add note" button when an `onAdd` handler is in context. Notes
 * are matched by stable entity id — never screen coordinates — so they stay
 * attached across devices, layouts and redesigns.
 */
export function EntityNotes({
  entityType,
  entityId,
  screen,
  date,
  label,
}: NoteAnchorCtx) {
  const { t } = useTranslation();
  const { notes, onAdd } = useContext(EntityNotesContext);
  const mine = notes.filter(
    (n) => n.entityType === entityType && n.entityId === entityId,
  );

  // Deep-link focus: when a notification targets this entity, scroll to it and
  // flash a highlight ring, then clear the transient focus target.
  const focusType = useFocus((s) => s.entityType);
  const focusId = useFocus((s) => s.entityId);
  const clearFocus = useFocus((s) => s.clearFocus);
  const ref = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (focusType !== entityType || focusId !== entityId) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(true);
    const t1 = setTimeout(() => setHighlight(false), 2500);
    const t2 = setTimeout(() => clearFocus(), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusType, focusId, entityType, entityId, clearFocus]);

  if (mine.length === 0 && !onAdd) return null;
  return (
    <div
      ref={ref}
      className={`mt-1.5 space-y-1.5 rounded-lg transition-shadow flex flex-col  ${highlight ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`}
      data-testid={`entity-notes-${entityType}-${entityId}`}
    >
      {mine.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-1.5 rounded-lg border border-brand/25 bg-brand/5 px-2.5 py-1.5 text-[12.5px] text-earth-muted"
        >
          <Icon name="info" size={13} className="mt-0.5 shrink-0 text-brand" />
          <span className="whitespace-pre-wrap">{n.body}</span>
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          data-testid={`add-note-${entityType}-${entityId}`}
          onClick={() => onAdd({ screen, date, entityType, entityId, label })}
          className="inline-flex justify-end items-center gap-1 text-[12px] font-medium text-brand-light"
        >
          <Icon name="edit" size={12} /> {t("notes.addNote")}
        </button>
      )}
    </div>
  );
}
