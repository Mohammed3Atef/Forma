import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VideoFilePlayer } from '@/components/video/VideoPlayer';

/**
 * B4.1 — exercise demonstrations: nothing loads until Play is tapped (poster only — no bandwidth,
 * and no false "couldn't load" on mobile Safari, which ignores preload); the tap plays muted,
 * inline and looping; several approved demonstrations of the SAME exercise can be chosen, and
 * switching starts the new one from its poster.
 */
vi.mock('@/hooks/useCatalog', () => ({ useTaxonomyLabel: () => (_t: unknown, _k: string, id: string) => id }));

import { CatalogExerciseView } from './CatalogExercisePreview';

describe('lazy demonstration player', () => {
  it('shows the poster and loads no video until Play; then plays muted, inline and looping', () => {
    const { container } = render(<VideoFilePlayer url="https://cdn.test/a.mp4" poster="https://cdn.test/a.webp" lazy muted loop aspect={16 / 9} playLabel="Play demo" testId="demo" />);
    expect(container.querySelector('video')).toBeNull();
    const play = screen.getByRole('button', { name: 'Play demo' });
    expect(play.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/a.webp');
    expect(play).toHaveStyle({ aspectRatio: String(16 / 9) });
    fireEvent.click(play);
    const video = screen.getByTestId('demo') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', 'https://cdn.test/a.mp4');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('poster', 'https://cdn.test/a.webp');
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(screen.getByTestId('video-loading')).toBeInTheDocument(); // honest state until the first frame
  });

  it('a video that fails says so, with Retry — never a dead 0:00 player', () => {
    render(<VideoFilePlayer url="https://cdn.test/broken.mp4" lazy muted testId="demo" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.error(screen.getByTestId('demo'));
    expect(screen.getByTestId('video-failed')).toBeInTheDocument();
    expect(screen.getByTestId('video-retry')).toBeInTheDocument();
  });
});

describe('several demonstrations of one exercise', () => {
  const L = (en: string, ar = en) => ({ en, ar });
  const video = (id: string, label?: { en: string; ar: string }) => ({
    id,
    kind: 'video' as const,
    url: `https://cdn.test/${id}.mp4`,
    hosting: 'forma-cdn' as const,
    cdnPath: `catalog/exercises/fx_barbell_bench_press/${id}.mp4`,
    role: (id === 'vid_1' ? 'primary' : 'alternate') as 'primary' | 'alternate',
    ...(label ? { label } : {}),
    format: 'mp4' as const,
    mime: 'video/mp4' as const,
    codec: 'h264' as const,
    width: 1280,
    height: 720,
    license: 'CC-BY-SA-4.0' as const,
    author: 'Goulart',
    sourcePage: 'https://wger.de/en/exercise/73/view/',
    source: { provider: 'wger' as const, id },
    verified: 'visual' as const,
    rights: 'verified' as const,
    review: 'approved' as const,
    publication: 'published' as const,
    posterUrl: `https://cdn.test/${id}.webp`,
  });
  const e = {
    id: 'fx_barbell_bench_press',
    status: 'published' as const,
    rev: 1,
    name: L('Barbell bench press', 'ضغط البار على البنش المستوي'),
    aliases: { en: [], ar: [], eg: [] },
    bodyPart: 'chest',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: ['barbell'],
    pattern: 'horizontal-push',
    mechanics: 'compound',
    difficulty: 'intermediate',
    laterality: 'bilateral',
    instructions: { en: { setup: ['Lie on the bench.'], steps: ['Lower.', 'Press.'], cues: ['Feet down.'], mistakes: ['Bouncing.'], safety: [] }, ar: { setup: ['استلقِ.'], steps: ['أنزل.', 'ادفع.'], cues: ['القدمان ثابتتان.'], mistakes: ['الارتداد.'], safety: [] } },
    media: [video('vid_1', L('Front view', 'من الأمام')), video('vid_2')],
    sources: [],
    content: { license: 'FORMA-PROPRIETARY' as const, author: 'Forma' as const, review: 'draft' as const, translation: 'draft' as const },
    legacyIds: [],
  };

  it('lists every demonstration (its label, else "Demo n"); switching shows that one from its poster; instructions and credits stay', () => {
    render(<CatalogExerciseView e={e as never} taxonomy={{} as never} />);
    const switcher = screen.getByTestId('catalog-demo-switch');
    const options = within(switcher).getAllByTestId('catalog-demo-option');
    expect(options.map((o) => o.textContent)).toEqual(['Front view', 'Demo 2']);
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('catalog-demo')).toHaveAttribute('data-demo', 'vid_1');
    fireEvent.click(screen.getByTestId('catalog-video-poster'));
    expect(screen.getByTestId('catalog-video')).toHaveAttribute('src', 'https://cdn.test/vid_1.mp4');
    fireEvent.click(options[1]);
    expect(screen.getByTestId('catalog-demo')).toHaveAttribute('data-demo', 'vid_2');
    expect(screen.getByTestId('catalog-video-poster').querySelector('img')).toHaveAttribute('src', 'https://cdn.test/vid_2.webp'); // back to a poster: nothing loads uninvited
    expect(screen.getByTestId('exercise-instructions')).toHaveTextContent('Press.');
    expect(screen.getByTestId('media-credits').textContent?.match(/Goulart/g)).toHaveLength(2);
  });
});
