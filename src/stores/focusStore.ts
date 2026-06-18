import { create } from 'zustand';
import type { NoteEntityType } from '@/types';

/**
 * Transient "scroll to + highlight this entity" target, set just before a
 * deep-link navigation (e.g. tapping a coach-note notification) and consumed by
 * the entity on the destination screen (via <EntityNotes>), which scrolls itself
 * into view, flashes a highlight, then clears the target.
 */
interface FocusState {
  entityType: NoteEntityType | null;
  entityId: string | null;
  focusEntity: (target: { entityType: NoteEntityType; entityId: string }) => void;
  clearFocus: () => void;
}

export const useFocus = create<FocusState>((set) => ({
  entityType: null,
  entityId: null,
  focusEntity: ({ entityType, entityId }) => set({ entityType, entityId }),
  clearFocus: () => set({ entityType: null, entityId: null }),
}));
