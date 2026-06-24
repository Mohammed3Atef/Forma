import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { Reveal } from '../Reveal';

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'clients', icon: 'user' },
  { key: 'programs', icon: 'dumbbell' },
  { key: 'adherence', icon: 'chart' },
  { key: 'nutrition', icon: 'meal' },
  { key: 'messaging', icon: 'chat' },
  { key: 'secure', icon: 'shield' },
];

export function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" data-testid="landing-features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('landing.featuresEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {t('landing.featuresTitle')}
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.key} delay={(i % 3) * 90} className="h-full">
              <div className="card h-full transition-colors duration-300 hover:border-brand/40">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
                  <Icon name={f.icon} size={24} />
                </div>
                <h3 className="font-display text-lg font-semibold">{t(`landing.features.${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-earth-muted">{t(`landing.features.${f.key}.desc`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
