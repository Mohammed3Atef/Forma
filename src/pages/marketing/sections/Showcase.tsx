import { useTranslation } from 'react-i18next';
import { Reveal } from '../Reveal';

const SHOTS = [
  { img: 'showcase-mobile', cap: 'mobile' },
  { img: 'showcase-dashboard', cap: 'dashboard' },
  { img: 'showcase-flow', cap: 'flow' },
  { img: 'showcase-clarity', cap: 'clarity' },
] as const;

export function Showcase() {
  const { t } = useTranslation();
  return (
    <section id="showcase" data-testid="landing-showcase" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('landing.showcaseEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {t('landing.showcaseTitle')}
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {SHOTS.map((s, i) => (
            <Reveal key={s.img} delay={(i % 2) * 110}>
              <figure className="group overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card">
                <div className="overflow-hidden">
                  <img
                    src={`/landing_page/${s.img}.png`}
                    alt={t(`landing.showcase.${s.cap}`)}
                    width={1536}
                    height={1024}
                    loading="lazy"
                    decoding="async"
                    className="block w-full transition-transform duration-500 ease-card group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="border-t border-line-soft px-5 py-4 text-sm text-earth-muted">
                  {t(`landing.showcase.${s.cap}`)}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
