import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertExerciseMediaAllowed, exerciseMediaProblem } from './exerciseMedia.js';

/**
 * B4.2 — who may put which demonstration on an exercise: any public https link (a coach's own page,
 * a video host, an ExerciseDB GIF) or the app's own ExerciseDB list still; a file on Forma's storage
 * only from the coach's own `exercises` folder — never another coach's, never a client's private
 * media; never javascript:/data:. Links already in the stored document stay.
 */
const CDN = 'https://media.forma.test';
const saved = process.env.BUNNY_CDN_URL;
beforeEach(() => {
  process.env.BUNNY_CDN_URL = CDN;
});
afterEach(() => {
  if (saved === undefined) delete process.env.BUNNY_CDN_URL;
  else process.env.BUNNY_CDN_URL = saved;
});

describe('exercise demonstrations', () => {
  it('public links and the app list still are fine; uploads only from the coach’s own exercises folder', () => {
    expect(exerciseMediaProblem('https://static.exercisedb.dev/media/EIeI8Vf.gif', 'coach-a')).toBeNull();
    expect(exerciseMediaProblem('https://www.youtube.com/watch?v=abc', 'coach-a')).toBeNull();
    expect(exerciseMediaProblem('/catalog/edb/EIeI8Vf.webp', 'coach-a')).toBeNull();
    expect(exerciseMediaProblem(`${CDN}/Forma/coach-a/exercises/x.webp`, 'coach-a')).toBeNull();
    expect(exerciseMediaProblem(`${CDN}/Forma/coach-b/exercises/x.webp`, 'coach-a')).toMatch(/your own/);
    expect(exerciseMediaProblem(`${CDN}/Forma/client-1/progress.jpg`, 'coach-a')).toMatch(/your own/);
    expect(exerciseMediaProblem(`${CDN}/Forma/coach-a/exercises/../../client-1/a.jpg`, 'coach-a')).toMatch(/your own/);
    expect(exerciseMediaProblem('javascript:alert(1)', 'coach-a')).toMatch(/https/);
    expect(exerciseMediaProblem('data:image/png;base64,AAAA', 'coach-a')).toMatch(/https/);
    expect(exerciseMediaProblem('/etc/passwd', 'coach-a')).toMatch(/https/);
  });

  it('every link in a plan body is checked — exercises, images lists, the restorable source media', () => {
    const plan = { exercises: { a: { name: 'Curl', imageUrl: '/catalog/edb/X1.webp', images: ['https://static.exercisedb.dev/media/X1.gif'], sourceMedia: { videoUrl: `${CDN}/Forma/client-1/msg.mp4` } } } };
    expect(() => assertExerciseMediaAllowed(plan, 'coach-a')).toThrow(/your own/);
    plan.exercises.a.sourceMedia.videoUrl = 'https://static.exercisedb.dev/media/X1.gif';
    expect(() => assertExerciseMediaAllowed(plan, 'coach-a')).not.toThrow();
  });

  it('a link the stored document already holds stays (transfer), a new one must pass', () => {
    const fromA = { exercises: { a: { name: 'Curl', videoUrl: `${CDN}/Forma/coach-a/exercises/v.mp4` } } };
    expect(() => assertExerciseMediaAllowed(fromA, 'coach-b', fromA)).not.toThrow();
    const added = { exercises: { ...fromA.exercises, b: { name: 'Row', videoUrl: `${CDN}/Forma/coach-a/exercises/w.mp4` } } };
    expect(() => assertExerciseMediaAllowed(added, 'coach-b', fromA)).toThrow(/your own/);
  });
});
