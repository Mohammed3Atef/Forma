import { HeroProblemStory } from './sections/HeroProblemStory';

/**
 * `/experience` — the cinematic 3D rebuild of the marketing site (see
 * `docs/EXPERIENCE_STORYBOARD.md`). Lives alongside the existing marketing
 * page at `/` so it can be reviewed and iterated on before anything switches
 * over. Only §1 Hero + §2 Problem are built so far; later sections are
 * storyboarded but not yet implemented — `PreviewBoundary` below is an honest
 * stand-in for that so scrolling past the finished part doesn't just dead-end
 * into blank space, not a stub for a real section.
 */
export function Experience() {
  return (
    // NOTE: `overflow-x-hidden` here is safe for the *page* itself, but do not
    // add `overflow` of any kind to an ancestor of the pinned story below —
    // see the note in `useStoryProgress.ts` about why that broke pinning.
    <div data-testid="experience-page" className="min-h-dvh overflow-x-hidden bg-surface text-earth">
      <HeroProblemStory />
      <PreviewBoundary />
    </div>
  );
}

function PreviewBoundary() {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-line-soft px-6 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-earth-subtle">Preview build</p>
      <p className="max-w-md text-sm text-earth-muted">
        Client management, plan building, the library, and the rest of the story are storyboarded in{' '}
        <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">docs/EXPERIENCE_STORYBOARD.md</code> — next up.
      </p>
    </div>
  );
}
