import { Link } from 'react-router-dom';
import { Reveal } from '@/pages/marketing/Reveal';
import { PROBLEM_FRAGMENTS } from './ProblemCopy';

/**
 * No-WebGL / `prefers-reduced-motion` version of the Hero + Problem story.
 * Same copy, same beats, but as plain stacked sections that fade in on
 * viewport-enter (the app's existing `Reveal` component, already disabled
 * under `prefers-reduced-motion` at the CSS level) instead of scroll-scrubbed
 * 3D + GSAP timelines. Nothing here depends on WebGL, and no motion is forced
 * on anyone who's asked for less.
 */
export function StaticFallbackStory() {
  return (
    <div className="bg-surface">
      <section className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
        {/* The logo image already includes the "Train. Track. Transform." tagline — no separate text line. */}
        <img src="/Forma-logo.png" alt="Forma — Train. Track. Transform." className="h-24 w-auto object-contain sm:h-32 lg:h-36" />
        <h1 className="mt-8 max-w-3xl font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.02em] text-earth sm:text-5xl">
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
          <a href="#problem" className="btn-ghost btn-lg w-full sm:w-auto">
            See how it works
          </a>
        </div>
      </section>

      <section id="problem" className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Reveal>
          <h2 className="font-display text-2xl font-semibold text-earth sm:text-3xl">Coaching gets complicated fast.</h2>
        </Reveal>
        <div className="mt-10 space-y-4">
          {PROBLEM_FRAGMENTS.map((line, i) => (
            <Reveal key={line} delay={i * 80}>
              <p className="text-lg text-earth-muted sm:text-xl">{line}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={PROBLEM_FRAGMENTS.length * 80 + 120}>
          <h2 className="mt-14 font-display text-2xl font-semibold text-earth sm:text-4xl">Forma brings it together.</h2>
        </Reveal>
      </section>
    </div>
  );
}
