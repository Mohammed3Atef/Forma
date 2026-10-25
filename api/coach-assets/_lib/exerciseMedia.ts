import { TRPCError } from '@trpc/server';
import { MediaUrlSchema } from './schemas.js';

/**
 * B4.2 — who may put which demonstration on an exercise (library exercise, template, client plan).
 * A coach may link any public https demonstration (their own page, a video host, an ExerciseDB
 * GIF) or the app's own ExerciseDB list still — but a file on Forma's own storage only from THEIR
 * `exercises` folder: never another coach's upload, never a client's private media (progress
 * photos and message attachments live on the same host). Checked on every save; a link the stored
 * document already holds is kept as it is (history stays editable — e.g. after a transfer).
 */
const MEDIA_KEYS = ['imageUrl', 'images', 'thumbUrl', 'videoUrl', 'videoPosterUrl'] as const;

function uploadBase(): string | null {
  const v = process.env.BUNNY_CDN_URL?.trim().replace(/\/+$/, '');
  return v || null;
}

/** Why `url` may not be saved on an exercise for `coachId`, or null when it may. */
export function exerciseMediaProblem(url: string, coachId: string | null): string | null {
  if (!url) return null;
  if (!MediaUrlSchema.safeParse(url).success) return 'Media links must be https:// links';
  const base = uploadBase();
  if (base && url.startsWith(`${base}/`)) {
    const folder = `${base}/Forma/${coachId}/exercises/`;
    if (!coachId || !url.startsWith(folder) || url.slice(folder.length).includes('..')) return 'An uploaded demonstration must be one of your own';
  }
  return null;
}

function eachMediaUrl(body: unknown, visit: (url: string) => void): void {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 14 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    for (const k of MEDIA_KEYS) {
      const val = o[k];
      if (typeof val === 'string') visit(val.trim());
      else if (Array.isArray(val)) for (const x of val) if (typeof x === 'string') visit(x.trim());
    }
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(body, 0);
}

/** Every demonstration link anywhere in a saved body, checked for `coachId` (stored links kept). */
export function assertExerciseMediaAllowed(body: unknown, coachId: string | null, previous?: unknown): void {
  const stored = new Set<string>();
  if (previous) eachMediaUrl(previous, (u) => stored.add(u));
  eachMediaUrl(body, (url) => {
    if (stored.has(url)) return;
    const problem = exerciseMediaProblem(url, coachId);
    if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  });
}
