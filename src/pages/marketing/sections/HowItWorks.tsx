import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { Reveal } from '../Reveal';

const STEPS: { n: string; icon: IconName }[] = [
  { n: '1', icon: 'user' },
  { n: '2', icon: 'dumbbell' },
  { n: '3', icon: 'meal' },
  { n: '4', icon: 'chart' },
  { n: '5', icon: 'bolt' },
];

export function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section id="how" data-testid="landing-steps" className="scroll-mt-20 border-t border-line/40 bg-surface-card/30 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('landing.stepsEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {t('landing.stepsTitle')}
          </h2>
        </Reveal>

        <ol className="mt-12 space-y-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 70}>
              <li className="card flex items-center gap-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10">
                  <span className="font-mono text-lg font-medium text-brand">{`0${s.n}`}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold">{t(`landing.steps.${s.n}.title`)}</h3>
                  <p className="mt-1 text-sm text-earth-muted">{t(`landing.steps.${s.n}.desc`)}</p>
                </div>
                <Icon name={s.icon} size={26} className="hidden shrink-0 text-brand/70 sm:block" />
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
