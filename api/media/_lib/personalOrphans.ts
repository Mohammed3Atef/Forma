import type { Collection, Document } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import { listAllImages, type CdnImage } from './bunny.js';
import { personalMedia, type PersonalCategory } from './delivery.js';

/**
 * MD-03 (B4.3) — personal media nothing shows any more: avatars that were replaced, progress /
 * assessment / check-in photos that were removed, attachments of DELETED messages (the message row
 * stays for audit, its file does not need to). REPORT ONLY — deleting storage objects is an
 * owner-approved operation (the report lists exactly what would go, with sizes).
 *
 * A file is reported when no stored document references it and it is older than the grace period
 * (an upload whose form or outbox has not saved yet may still be referenced soon). Unknown age →
 * never reported.
 */
export const PERSONAL_ORPHAN_GRACE_MS = 14 * 86_400_000;

/** Every personal-media zone path referenced (as a CDN URL, signed or not) anywhere in `docs`. */
export function collectPersonalPaths(docs: Iterable<unknown>, cdnBase: string, into = new Set<string>()): Set<string> {
  const cdn = cdnBase.replace(/\/+$/, '');
  const walk = (v: unknown, depth: number) => {
    if (depth > 20 || v == null) return;
    if (typeof v === 'string') {
      const m = personalMedia(v, cdn);
      if (m) into.add(m.path);
      return;
    }
    if (typeof v !== 'object') return;
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  for (const d of docs) walk(d, 0);
  return into;
}

export interface PersonalOrphan {
  path: string;
  ownerId: string;
  category: PersonalCategory;
  size: number;
  lastChanged: string | null;
}

export function personalOrphans(files: Pick<CdnImage, 'url' | 'path' | 'size' | 'lastChanged'>[], referenced: Set<string>, cdnBase: string, now: number, graceMs = PERSONAL_ORPHAN_GRACE_MS): PersonalOrphan[] {
  const cdn = cdnBase.replace(/\/+$/, '');
  return files.flatMap((f): PersonalOrphan[] => {
    const m = personalMedia(`${cdn}/${f.path}`, cdn);
    if (!m || referenced.has(m.path)) return [];
    const at = f.lastChanged ? Date.parse(f.lastChanged) : NaN;
    if (!Number.isFinite(at) || now - at <= graceMs) return [];
    return [{ path: m.path, ownerId: m.ownerId, category: m.category, size: f.size, lastChanged: f.lastChanged ?? null }];
  });
}

/** Where personal media URLs are stored (a deleted message's attachment does not count). */
const SOURCES: { collection: string; filter: Document }[] = [
  { collection: 'users', filter: {} },
  { collection: 'clientProfiles', filter: {} },
  { collection: 'checkIns', filter: {} },
  { collection: 'messages', filter: { deletedAt: { $exists: false } } },
  { collection: 'syncRecords', filter: {} },
  { collection: 'syncSingletons', filter: {} },
  { collection: 'archivedClientData', filter: {} },
  { collection: 'notifications', filter: {} },
];

/** Lists the zone and every document that may hold personal media; returns the report. */
export async function findPersonalMediaOrphans(cdnBase: string, now = Date.now()) {
  const cdn = cdnBase.replace(/\/+$/, '');
  // Every object (attachments include audio, video and documents), personal paths only.
  const files = (await listAllImages('Forma', 4, () => true)).filter((f) => personalMedia(`${cdn}/${f.path}`, cdn));
  const db = await getDb();
  const referenced = new Set<string>();
  for (const s of SOURCES) {
    const col = db.collection(s.collection) as Collection<Document>;
    for await (const doc of col.find(s.filter)) collectPersonalPaths([doc], cdnBase, referenced);
  }
  const orphans = personalOrphans(files, referenced, cdnBase, now);
  return { files: files.length, referenced: referenced.size, graceDays: PERSONAL_ORPHAN_GRACE_MS / 86_400_000, orphans, orphanBytes: orphans.reduce((n, o) => n + o.size, 0) };
}
