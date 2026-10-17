/**
 * Announcement dismissals (NT-10, owner 2026-10-17).
 *
 * A dismissed informational announcement stays dismissed for THIS signed-in
 * user across app launches — until it changes materially (its title, body,
 * link or style), which makes it a new version that shows again. Storage is
 * this device's `localStorage`, keyed per account (the same per-user pattern
 * as the toast baseline), so switching accounts never carries one user's
 * dismissals to another and nothing depends on the network.
 *
 * Never permanent: a `warning` announcement is dismissed for the current
 * session only (it returns on the next launch). Critical plan, payment and
 * account notices are not announcements and have no dismiss at all.
 */
export interface DismissibleAnnouncement {
  id: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  style: string;
}

const PERSIST_KEY = (uid: string) => `forma.dismissedBanners.v1.${uid}`;
const SESSION_KEY = (uid: string) => `forma.dismissedBanners.session.v1.${uid}`;
/** Bound the stored list (oldest dismissals drop first). */
const MAX_ENTRIES = 200;

/** Small stable string hash (djb2) — the version is "what the announcement says", not when it was saved. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Identity + content version: an edit to what the viewer reads (or how it is styled) is a new announcement. */
export function announcementVersion(b: DismissibleAnnouncement): string {
  return `${b.id}:${hash([b.title, b.body ?? '', b.ctaLabel ?? '', b.ctaHref ?? '', b.style].join('\u0000'))}`;
}

/** Only informational announcements may stay dismissed across launches. */
export function dismissalPersists(style: string): boolean {
  return style !== 'warning';
}

function read(storage: Storage | undefined, key: string): string[] {
  try {
    const raw = storage?.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(storage: Storage | undefined, key: string, list: string[]) {
  try {
    storage?.setItem(key, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    /* storage unavailable (private mode, quota) — the dismissal lasts until the page closes */
  }
}

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

/** Versions this user has dismissed (persisted + this session's). */
export function loadDismissals(uid: string | null | undefined): Set<string> {
  if (!uid) return new Set();
  return new Set([...read(local(), PERSIST_KEY(uid)), ...read(session(), SESSION_KEY(uid))]);
}

/** Record a dismissal for this user: across launches for informational styles, this session only for warnings. */
export function rememberDismissal(uid: string | null | undefined, b: DismissibleAnnouncement): void {
  if (!uid) return;
  const v = announcementVersion(b);
  const persist = dismissalPersists(b.style);
  const storage = persist ? local() : session();
  const key = persist ? PERSIST_KEY(uid) : SESSION_KEY(uid);
  const list = read(storage, key).filter((x) => x !== v);
  list.push(v);
  write(storage, key, list);
}
