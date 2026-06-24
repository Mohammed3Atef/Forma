import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { useReveal } from '@/hooks/useReveal';

const STATS: { key: string; value: number; suffix: string; icon: IconName }[] = [
  { key: 'hours', value: 10, suffix: '+', icon: 'timer' },
  { key: 'clients', value: 3, suffix: '×', icon: 'user' },
  { key: 'adherence', value: 85, suffix: '%', icon: 'target' },
  { key: 'coaches', value: 200, suffix: '+', icon: 'trophy' },
];

/** Eases 0→target once `active`, jumping straight to target if motion is reduced. */
function useCountUp(target: number, active: boolean): number {
  const [n, setN] = useState(0);
  const ran = useRef(false);
  useEffect(() => {
    if (!active || ran.current) return;
    ran.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(target);
      return;
    }
    const duration = 1100;
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  return n;
}

function StatTile({ stat, index }: { stat: (typeof STATS)[number]; index: number }) {
  const { t } = useTranslation();
  const { ref, visible } = useReveal<HTMLDivElement>();
  const n = useCountUp(stat.value, visible);
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-in' : ''} stat-tile items-center text-center`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
        <Icon name={stat.icon} size={22} />
      </div>
      <div className="stat-num">
        {n}
        <span className="text-brand">{stat.suffix}</span>
      </div>
      <div className="stat-label normal-case tracking-normal">{t(`landing.benefits.${stat.key}`)}</div>
    </div>
  );
}

export function Benefits() {
  const { t } = useTranslation();
  return (
    <section className="scroll-mt-20 border-t border-line/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-2xl text-center font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          {t('landing.benefitsTitle')}
        </h2>
        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <StatTile key={s.key} stat={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
