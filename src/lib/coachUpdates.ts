import type { FeedRow } from '@/lib/notificationTaxonomy';
import type { CoachNote } from '@/types';

/** How close a note and its "new coach note" notification are created (server writes both in one request). */
const PAIR_WINDOW_MS = 5 * 60_000;

export type UpdateItem = { kind: 'note'; at: number; note: CoachNote; row?: FeedRow } | { kind: 'notif'; at: number; row: FeedRow };

/**
 * Pairs each shared coach note with the "new coach note" notification the
 * server wrote for it (same excerpt — the first 140 characters — created in the
 * same request). A paired note is shown ONCE, as the note, carrying the
 * notification's unread state. A notification with no note (deleted, or the
 * notes failed to load) stays a row of its own, so nothing is hidden.
 */
export function mergeUpdates(rows: FeedRow[], notes: CoachNote[]): UpdateItem[] {
  const used = new Set<string>();
  const items: UpdateItem[] = notes.map((note) => {
    const excerpt = note.body.trim().slice(0, 140);
    const row = rows.find((r) => r.rep.type === 'coach_note' && !used.has(r.rep.id) && r.rep.body === excerpt && Math.abs(r.rep.createdAt - note.createdAt) < PAIR_WINDOW_MS);
    if (row) used.add(row.rep.id);
    return { kind: 'note', at: note.createdAt, note, row };
  });
  for (const row of rows) if (!used.has(row.rep.id)) items.push({ kind: 'notif', at: row.rep.createdAt, row });
  return items.sort((a, b) => b.at - a.at);
}

