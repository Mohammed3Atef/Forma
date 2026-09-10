import type { RefObject } from 'react';

/** The fragmented-workflow lines from the brief, in reveal order. */
export const PROBLEM_FRAGMENTS = [
  'Clients in WhatsApp.',
  'Plans in spreadsheets.',
  'Progress in photo folders.',
  'Payments tracked manually.',
  'Notes everywhere.',
] as const;

interface ProblemCopyProps {
  introRef: RefObject<HTMLParagraphElement>;
  resolutionRef: RefObject<HTMLParagraphElement>;
  registerFragmentRef: (index: number, el: HTMLParagraphElement | null) => void;
}

/**
 * All lines are absolutely stacked in the same spot and start at `opacity-0`
 * — the GSAP timeline built in `HeroProblemStory` is the only thing that ever
 * shows them, keyed to scroll progress. Nothing here animates on its own.
 */
export function ProblemCopy({ introRef, resolutionRef, registerFragmentRef }: ProblemCopyProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
      <div className="relative h-32 w-full max-w-2xl sm:h-24">
        <p
          ref={introRef}
          className="absolute inset-0 flex items-center justify-center font-display text-2xl font-semibold text-earth opacity-0 sm:text-3xl"
        >
          Coaching gets complicated fast.
        </p>

        {PROBLEM_FRAGMENTS.map((line, i) => (
          <p
            key={line}
            ref={(el) => registerFragmentRef(i, el)}
            className="absolute inset-0 flex items-center justify-center text-xl text-earth-muted opacity-0 sm:text-2xl"
          >
            {line}
          </p>
        ))}

        <p
          ref={resolutionRef}
          className="absolute inset-0 flex items-center justify-center font-display text-2xl font-semibold text-earth opacity-0 sm:text-4xl"
        >
          Forma brings it together.
        </p>
      </div>
    </div>
  );
}
