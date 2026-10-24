import { describe, expect, it } from 'vitest';
import { mergeUpdates } from './coachUpdates';
import { coalesceFeed } from './notificationTaxonomy';
import type { AppNotification, CoachNote } from '@/types';

const T = 1_760_000_000_000;
const note = (id: string, body: string, createdAt: number, extra: Partial<CoachNote> = {}): CoachNote =>
  ({ id, clientId: 'c1', authorId: 'k1', authorRole: 'coach', body, visibility: 'client', createdAt, updatedAt: createdAt, ...extra }) as CoachNote;
const notif = (id: string, type: AppNotification['type'], createdAt: number, extra: Partial<AppNotification> = {}): AppNotification =>
  ({ id, clientId: 'c1', forRole: 'client', type, createdAt, createdBy: 'k1', updatedAt: createdAt, seenAt: null, ...extra }) as AppNotification;

describe('mergeUpdates (B2.6 Coach › Updates)', () => {
  it('shows a shared note once, carrying its notification’s unread state', () => {
    const items = mergeUpdates(coalesceFeed([notif('n1', 'coach_note', T + 200, { body: 'Great week' })]), [note('a', 'Great week', T)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'note', note: { id: 'a' }, row: { unseen: true, rep: { id: 'n1' } } });
  });

  it('pairs on the 140-character excerpt the server stores', () => {
    const long = 'x'.repeat(200);
    const items = mergeUpdates(coalesceFeed([notif('n1', 'coach_note', T, { body: long.slice(0, 140) })]), [note('a', `  ${long}  `, T)]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('note');
  });

  it('keeps a coach-note notification with no note as its own row (nothing hidden)', () => {
    const items = mergeUpdates(coalesceFeed([notif('n1', 'coach_note', T, { body: 'Check this meal' })]), []);
    expect(items).toEqual([expect.objectContaining({ kind: 'notif', row: expect.objectContaining({ rep: expect.objectContaining({ id: 'n1' }) }) })]);
  });

  it('does not pair the same text written far apart in time', () => {
    const items = mergeUpdates(coalesceFeed([notif('n1', 'coach_note', T + 60 * 60_000, { body: 'Same text' })]), [note('a', 'Same text', T)]);
    expect(items.map((i) => i.kind).sort()).toEqual(['note', 'notif']);
  });

  it('pairs one notification with one note only, and orders newest first', () => {
    const rows = coalesceFeed([notif('n2', 'checkin_requested', T + 500), notif('n1', 'coach_note', T + 10, { body: 'Hi' })]);
    const items = mergeUpdates(rows, [note('a', 'Hi', T), note('b', 'Hi', T + 5)]);
    expect(items.filter((i) => i.kind === 'note' && i.row)).toHaveLength(1);
    expect(items.map((i) => i.at)).toEqual([T + 500, T + 5, T]);
  });
});
