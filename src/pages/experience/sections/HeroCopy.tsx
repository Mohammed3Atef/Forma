import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * Hero copy block — holds at full opacity for the first ~22% of the story's
 * scroll range, then lifts out (see `HeroProblemStory`'s GSAP timeline) as
 * the dumbbell begins its transformation into a barbell.
 */
export const HeroCopy = forwardRef<HTMLDivElement>(function HeroCopy(_props, ref) {
  const scrollToNext = () => {
    window.scrollTo({ top: window.innerHeight * 2.2, behavior: 'smooth' });
  };

  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      {/* The logo image already includes the "Train. Track. Transform." tagline — no separate text line. */}
      <img src="/Forma-logo.png" alt="Forma — Train. Track. Transform." className="h-24 w-auto object-contain sm:h-32 lg:h-36" />

      <h1 className="mt-8 max-w-3xl font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.02em] text-earth sm:text-5xl lg:text-6xl">
        Build stronger clients.{' '}
        <span className="bg-gradient-to-r from-gold via-brand to-brand-dark bg-clip-text text-transparent">
          Run a stronger coaching business.
        </span>
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-base text-earth-muted sm:text-lg">
        Manage clients, plans, progress, communication and revenue from one place.
      </p>

      <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
        <Link to="/login?signup=1" className="btn-primary btn-lg w-full sm:w-auto">
          Start coaching with Forma
        </Link>
        <button type="button" onClick={scrollToNext} className="btn-ghost btn-lg w-full sm:w-auto">
          See how it works
        </button>
      </div>
    </div>
  );
});
