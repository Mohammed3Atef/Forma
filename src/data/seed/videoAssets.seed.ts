import type { VideoAsset } from '@/types';
import { SEED_EXERCISE_LIST } from './workoutPlan.seed';

/**
 * Connect every exercise to its local video BY NAME. The user named each clip in
 * `public/exercise_videos/` after the exercise, so the file is derived from the
 * exercise's name (alphanumerics, lowercased). A small alias table covers the
 * few files whose name differs from the app's display name (e.g. the file
 * "incline db press" vs the exercise "Incline dumbbell press").
 *
 * No YouTube / remote URLs are used — playback is 100% from the local files.
 * Drop a correctly-named file into the folder and it links automatically.
 */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Exercise id -> file basename, only where the file name differs from the
// exercise's display name (otherwise the name itself is used).
const ALIAS: Record<string, string> = {
  incline_db_press: 'incline db press',
  peck_deck: 'peck deck machine',
  db_lateral_raise: 'db lateral raise',
  db_front_raise: 'db front raise',
  upside_down_kb: 'upside down kb',
  seated_db_curl: 'seated bicep curl with db',
  db_shrugs: 'db shrugs',
  rdl_db: 'rdl db',
  seated_calves: 'seated calves machine',
  lying_curl: 'lying curl',
};

/** Same-origin URL to a bundled local video file (spaces percent-encoded). */
export function localVideoUrl(file: string): string {
  return `/exercise_videos/${encodeURIComponent(file)}.mp4`;
}

export const SEED_VIDEO_ASSETS: VideoAsset[] = SEED_EXERCISE_LIST.map((e) => {
  const file = ALIAS[e.id] ?? norm(e.name);
  return {
    id: e.videoId,
    exerciseId: e.id,
    title: `${e.name} — explanation`,
    sourceUrl: localVideoUrl(file),
    kind: 'file',
    status: 'not-downloaded',
    updatedAt: 0,
  };
});
