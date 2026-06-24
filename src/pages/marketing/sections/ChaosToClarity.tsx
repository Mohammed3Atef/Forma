import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Reveal } from '../Reveal';

const KEYS = ['1', '2', '3', '4', '5'] as const;

export function ChaosToClarity() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';

  return (
    <section className="scroll-mt-20 border-t border-line/40 bg-surface-card/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('landing.chaosEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {t('landing.chaosTitle')}
          </h2>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-[1fr_auto_1fr]">
          <Reveal className="card border-danger/25 bg-danger/[0.04]">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.08em] text-danger">
              {t('landing.beforeTitle')}
            </h3>
            <ul className="space-y-3">
              {KEYS.map((k) => (
                <li key={k} className="flex items-start gap-3 text-sm text-earth-muted">
                  <Icon name="close" size={18} className="mt-0.5 shrink-0 text-danger/80" />
                  <span>{t(`landing.before.${k}`)}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <div className="flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-brand">
              <Icon name="chevron" size={22} className={rtl ? 'rotate-90 md:rotate-180' : 'rotate-90 md:rotate-0'} />
            </div>
          </div>

          <Reveal delay={120} className="card border-brand/30 bg-brand/[0.05]">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.08em] text-brand">
              {t('landing.afterTitle')}
            </h3>
            <ul className="space-y-3">
              {KEYS.map((k) => (
                <li key={k} className="flex items-start gap-3 text-sm text-earth">
                  <Icon name="check" size={18} className="mt-0.5 shrink-0 text-brand" />
                  <span>{t(`landing.after.${k}`)}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
