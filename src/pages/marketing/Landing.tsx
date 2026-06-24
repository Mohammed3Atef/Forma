import { LandingHeader } from './sections/LandingHeader';
import { Hero } from './sections/Hero';
import { ChaosToClarity } from './sections/ChaosToClarity';
import { Features } from './sections/Features';
import { HowItWorks } from './sections/HowItWorks';
import { Showcase } from './sections/Showcase';
import { Benefits } from './sections/Benefits';
import { FinalCta } from './sections/FinalCta';
import { LandingFooter } from './sections/LandingFooter';

/**
 * Forma marketing landing page — the anonymous front door at "/". Built from
 * the app's own design system (so it stays crisp + translatable) with the
 * staged screenshots as product visuals. Sections fade in on scroll via
 * `useReveal` (disabled under prefers-reduced-motion). CTAs route into the
 * existing auth form at /login (?signup=1 opens sign-up).
 */
export function Landing() {
  return (
    <div data-testid="landing-page" className="min-h-dvh overflow-x-hidden bg-surface text-white">
      <LandingHeader />
      <main>
        <Hero />
        <ChaosToClarity />
        <Features />
        <HowItWorks />
        <Showcase />
        <Benefits />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
