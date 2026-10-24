import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { buildInbox, calendarDaysAgo, dayLabelOf, previewOf, timeLabelOf, unreadBadge, type InboxClient, type InboxThread } from './coachInbox';

const COACH = 'coach-1';
const msg = (over: Partial<Message>): Message => ({
  id: over.id ?? `m-${Math.random()}`,
  clientId: 'c1',
  coachId: COACH,
  fromUserId: 'c1',
  fromRole: 'client',
  body: 'hello',
  seenAt: null,
  createdAt: 1_000,
  updatedAt: 1_000,
  ...over,
});

const clients: InboxClient[] = [
  { id: 'a', displayName: 'Amira Saleh', email: 'amira@x.test' },
  { id: 'b', displayName: 'Bassem', email: 'bassem@x.test' },
  { id: 'c', displayName: 'Carla', email: 'carla@x.test' },
  { id: 'd', email: 'dina@x.test' },
];
const threads: InboxThread[] = [
  { clientId: 'a', last: msg({ clientId: 'a', fromUserId: 'a', createdAt: 5_000 }), unreadForCoach: 2 },
  { clientId: 'b', last: msg({ clientId: 'b', fromUserId: COACH, fromRole: 'coach', createdAt: 9_000, seenAt: 9_500 }), unreadForCoach: 0 },
  { clientId: 'c', last: null, unreadForCoach: 0 },
];

describe('coach inbox model (B3.6)', () => {
  it('sorts newest conversation first, then clients without messages by name', () => {
    const inbox = buildInbox(clients, threads, { coachId: COACH });
    expect(inbox.rows.map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(inbox.rows[3].name).toBe('dina@x.test');
    expect(inbox.unreadThreads).toBe(1);
    expect(inbox.unreadMessages).toBe(2);
  });

  it('previews: "You:" for own, deleted, attachment-only, broadcast category, loading vs none', () => {
    expect(previewOf(msg({ fromUserId: COACH, fromRole: 'coach', body: 'see you' }), COACH, true)).toEqual({ kind: 'text', mine: true, text: 'see you', category: null });
    expect(previewOf(msg({ deletedAt: 3, body: '' }), COACH, true)).toEqual({ kind: 'deleted', mine: false });
    expect(previewOf(msg({ body: '', attachment: { url: 'u', kind: 'file', name: 'note.webm', mimeType: 'audio/webm' } }), COACH, true)).toEqual({ kind: 'attachment', mine: false, attachment: 'audio' });
    expect(previewOf(msg({ fromUserId: COACH, body: 'Gym closed Friday', category: 'announcement' }), COACH, true)).toMatchObject({ kind: 'text', category: 'announcement' });
    expect(previewOf(msg({ body: '  two\n\nlines ' }), COACH, true)).toMatchObject({ text: 'two lines' });
    expect(previewOf(null, COACH, false)).toEqual({ kind: 'loading' });
    expect(previewOf(null, COACH, true)).toEqual({ kind: 'none' });
    // Before the summary answers, no row claims "no messages".
    expect(buildInbox(clients, undefined, { coachId: COACH }).rows.every((r) => r.preview.kind === 'loading')).toBe(true);
  });

  it('search matches name and email; Unread keeps only unread conversations', () => {
    expect(buildInbox(clients, threads, { coachId: COACH, q: 'BASS' }).rows.map((r) => r.id)).toEqual(['b']);
    expect(buildInbox(clients, threads, { coachId: COACH, q: 'dina@' }).rows.map((r) => r.id)).toEqual(['d']);
    expect(buildInbox(clients, threads, { coachId: COACH, filter: 'unread' }).rows.map((r) => r.id)).toEqual(['a']);
    expect(buildInbox(clients, threads, { coachId: COACH, q: 'nobody' }).rows).toEqual([]);
  });

  it('the open conversation stays in the list under any filter or search (MS-09)', () => {
    const inbox = buildInbox(clients, threads, { coachId: COACH, filter: 'unread', q: 'amira', selectedId: 'b' });
    expect(inbox.rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('time labels: time today, Yesterday, weekday within a week, date, date with year', () => {
    const now = new Date(2026, 9, 19, 9, 0).getTime();
    expect(timeLabelOf(new Date(2026, 9, 19, 0, 5).getTime(), now).kind).toBe('time');
    expect(timeLabelOf(new Date(2026, 9, 18, 23, 59).getTime(), now).kind).toBe('yesterday');
    expect(timeLabelOf(new Date(2026, 9, 14, 12).getTime(), now).kind).toBe('weekday');
    expect(timeLabelOf(new Date(2026, 9, 12, 12).getTime(), now).kind).toBe('date');
    expect(timeLabelOf(new Date(2025, 11, 30).getTime(), now).kind).toBe('dateYear');
    expect(calendarDaysAgo(new Date(2026, 9, 18, 23, 59).getTime(), now)).toBe(1);
    expect(dayLabelOf(new Date(2026, 9, 19, 1).getTime(), now)).toBe('today');
    expect(dayLabelOf(new Date(2026, 9, 18, 1).getTime(), now)).toBe('yesterday');
    expect(dayLabelOf(new Date(2026, 0, 2).getTime(), now)).toBe('thisYear');
    expect(dayLabelOf(new Date(2025, 0, 2).getTime(), now)).toBe('otherYear');
  });

  it('badge text caps at 99+', () => {
    expect(unreadBadge(7)).toBe('7');
    expect(unreadBadge(120)).toBe('99+');
  });
});
