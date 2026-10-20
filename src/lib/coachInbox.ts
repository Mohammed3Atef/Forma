import type { Message, MessageCategory } from '@/types';
import { getAttachmentKind, type AttachmentKind } from './attachmentKind';

/**
 * The coach's Messages inbox (B3.6 / blueprint §6.5) as plain data: one row per
 * active client, newest conversation first, built from the roster and the
 * shared thread summary (`messages.coachThreadsSummary`). Nothing here invents
 * a state the server didn't report — no "online", no "typing", no urgency.
 */

export type InboxFilter = 'all' | 'unread';
export const INBOX_FILTERS: InboxFilter[] = ['all', 'unread'];

export interface InboxClient {
  id: string;
  displayName?: string;
  email?: string;
  photoUrl?: string;
}

export interface InboxThread {
  clientId: string;
  last: Message | null;
  unreadForCoach: number;
}

/** What a row says about the newest message. */
export type InboxPreview =
  /** The summary hasn't answered yet — never shown as "no messages". */
  | { kind: 'loading' }
  | { kind: 'none' }
  /** The server redacts a deleted message's text and attachment (MS-09). */
  | { kind: 'deleted'; mine: boolean }
  | { kind: 'text'; mine: boolean; text: string; category: MessageCategory | null }
  | { kind: 'attachment'; mine: boolean; attachment: AttachmentKind };

export interface InboxRow {
  id: string;
  name: string;
  photoUrl?: string;
  /** Newest message time (0 = none). */
  lastAt: number;
  unread: number;
  preview: InboxPreview;
  /** Lower-cased name + email, for the local search. */
  search: string;
}

export interface Inbox {
  /** Rows to show (after search / filter), newest first. */
  rows: InboxRow[];
  /** Every active client's row, newest first. */
  all: InboxRow[];
  /** Conversations with at least one unread message, and the messages in them. */
  unreadThreads: number;
  unreadMessages: number;
}

export function previewOf(last: Message | null | undefined, coachId: string, loaded: boolean): InboxPreview {
  if (!loaded) return { kind: 'loading' };
  if (!last) return { kind: 'none' };
  const mine = last.fromUserId === coachId;
  if (last.deletedAt) return { kind: 'deleted', mine };
  const text = last.body?.trim() ?? '';
  if (text) return { kind: 'text', mine, text: text.replace(/\s+/g, ' '), category: last.category && last.category !== 'message' ? last.category : null };
  if (last.attachment) {
    return { kind: 'attachment', mine, attachment: getAttachmentKind({ mimeType: last.attachment.mimeType, name: last.attachment.name, fallbackKind: last.attachment.kind }) };
  }
  return { kind: 'none' };
}

function nameOf(c: InboxClient): string {
  return (c.displayName || c.email || '').trim();
}

/** Newest first; conversations without messages after them, by name. */
function compareRows(a: InboxRow, b: InboxRow): number {
  if (a.lastAt !== b.lastAt) return b.lastAt - a.lastAt;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function buildInbox(
  clients: InboxClient[],
  threads: InboxThread[] | undefined,
  opts: { coachId: string; q?: string; filter?: InboxFilter; selectedId?: string | null },
): Inbox {
  const loaded = threads !== undefined;
  const byClient = new Map((threads ?? []).map((t) => [t.clientId, t]));
  const all = clients
    .map((c): InboxRow => {
      const t = byClient.get(c.id);
      const name = nameOf(c);
      return {
        id: c.id,
        name,
        photoUrl: c.photoUrl,
        lastAt: t?.last?.createdAt ?? 0,
        unread: t?.unreadForCoach ?? 0,
        preview: previewOf(t?.last, opts.coachId, loaded),
        search: `${name} ${c.email ?? ''}`.toLowerCase(),
      };
    })
    .sort(compareRows);

  const q = (opts.q ?? '').trim().toLowerCase();
  const filter = opts.filter ?? 'all';
  const rows = all.filter((r) => {
    // The open conversation never disappears because of a filter or a search (MS-09).
    if (opts.selectedId && r.id === opts.selectedId) return true;
    if (q && !r.search.includes(q)) return false;
    if (filter === 'unread' && r.unread === 0) return false;
    return true;
  });

  return {
    rows,
    all,
    unreadThreads: all.filter((r) => r.unread > 0).length,
    unreadMessages: all.reduce((n, r) => n + r.unread, 0),
  };
}

/** How a row labels its newest message's time: today's time, "Yesterday", a weekday this week, else a date (with the year when it isn't this year). */
export type TimeLabel = { kind: 'time' } | { kind: 'yesterday' } | { kind: 'weekday' } | { kind: 'date' } | { kind: 'dateYear' };

const DAY_MS = 86_400_000;
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Whole local calendar days between `ms` and `now` (0 = same day). */
export function calendarDaysAgo(ms: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
}

export function timeLabelOf(ms: number, now: number): TimeLabel {
  const days = calendarDaysAgo(ms, now);
  if (days <= 0) return { kind: 'time' };
  if (days === 1) return { kind: 'yesterday' };
  if (days < 7) return { kind: 'weekday' };
  return new Date(ms).getFullYear() === new Date(now).getFullYear() ? { kind: 'date' } : { kind: 'dateYear' };
}

/** A thread's day separator: Today, Yesterday, a short date this year, or a date with the year (MS-16). */
export type DayLabel = 'today' | 'yesterday' | 'thisYear' | 'otherYear';

export function dayLabelOf(ms: number, now: number): DayLabel {
  const days = calendarDaysAgo(ms, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return new Date(ms).getFullYear() === new Date(now).getFullYear() ? 'thisYear' : 'otherYear';
}

/** "9+"-style badge text; screen readers get the real number. */
export function unreadBadge(n: number): string {
  return n > 99 ? '99+' : String(n);
}
