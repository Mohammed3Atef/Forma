import { describe, expect, it } from 'vitest';
import { attributionOf, demoRank, exerciseDemo, hasPlayableVideo } from './libraryMedia';

/** B3.7 — the Library shows a demo only when there is one that can play; otherwise it says so (B0 honesty). */
describe('exercise demo states', () => {
  it('a playable video (YouTube or an https file) is a video', () => {
    expect(exerciseDemo({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).kind).toBe('video');
    const mov = exerciseDemo({ videoUrl: 'https://wger.de/media/exercise-video/1/a.MOV', images: ['https://wger.de/a.png'] });
    expect(mov).toMatchObject({ kind: 'video', image: 'https://wger.de/a.png' });
    expect(mov.kind === 'video' && mov.source.kind === 'file' && mov.source.maybeHevc).toBe(true); // the player reports a codec it can't decode
  });

  it('a link that cannot play is never a video: an image if there is one, else "No demo yet" — and the broken link is flagged', () => {
    expect(exerciseDemo({ videoUrl: 'https://drive.google.com/file/d/x/view', imageUrl: 'https://img.test/a.png' })).toEqual({ kind: 'image', url: 'https://img.test/a.png', brokenLink: true });
    expect(exerciseDemo({ videoUrl: 'javascript:alert(1)' })).toEqual({ kind: 'none', brokenLink: true });
    expect(exerciseDemo({ videoUrl: 'http://example.com/a.mp4' })).toEqual({ kind: 'none', brokenLink: true }); // not https
    expect(exerciseDemo({})).toEqual({ kind: 'none', brokenLink: false });
    expect(exerciseDemo({ videoUrl: '  ', images: ['', 'data:image/png;base64,xx'] })).toEqual({ kind: 'none', brokenLink: false });
  });

  it('"Has video" and the demo sort use the same rule', () => {
    expect(hasPlayableVideo({ videoUrl: 'https://cdn.test/a.webm' })).toBe(true);
    expect(hasPlayableVideo({ videoUrl: 'https://vimeo.com/123', imageUrl: 'https://img.test/a.png' })).toBe(false);
    expect([demoRank({ videoUrl: 'https://cdn.test/a.mp4' }), demoRank({ images: ['https://img.test/a.png'] }), demoRank({})]).toEqual([0, 1, 2]);
  });
});

describe('attribution', () => {
  it('known providers carry their licence, others show their name, none shows nothing', () => {
    expect(attributionOf({ sourceProvider: 'wger' })).toEqual({ provider: 'wger', name: 'wger.de', license: 'CC BY-SA', href: 'https://wger.de' });
    expect(attributionOf({ sourceProvider: 'forma' as never })).toEqual({ provider: 'forma', name: 'forma' });
    expect(attributionOf({})).toBeNull();
  });
});
