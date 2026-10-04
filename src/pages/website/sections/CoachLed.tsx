import { useState } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { capClass, SecHead } from '../components/type';

function List({ items, coach }: { items: string[]; coach?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li
          key={item}
          className={cx(
            "relative ps-[26px] text-[15px] leading-[1.5] before:absolute before:start-0 before:top-[.45em] before:h-3 before:w-3 before:rounded-full before:content-['']",
            coach ? 'text-earth before:bg-gradient-brand' : 'text-earth-muted before:border-2 before:border-site-line3',
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** "Coach-led": what Forma does vs what the coach does, around the hero artwork. */
export function CoachLed({ k }: { k: number }) {
  const { t } = useSiteT();
  const [imgFailed, setImgFailed] = useState(false);
  const col = 'flex flex-col gap-[14px] rounded-[24px] border p-6';
  return (
    <Section id="coach-led" k={k} labelledBy="h-cl" glow={{ gx: '50%', gy: '35%', hx: '15%', hy: '90%', ga: 'rgba(255,139,2,.2)' }}>
      <SectionWrap>
        <SecHead ns="coachLed" id="h-cl" center />
        <div className="grid items-center gap-[18px] min-[960px]:grid-cols-2 min-[960px]:gap-x-7 min-[960px]:gap-y-6">
          <Reveal className={cx(col, 'border-site-line bg-surface-card')}>
            <p className={cx(capClass, 'my-[1em]')}>{t('coachLed.toolCap')}</p>
            <List items={t('coachLed.tool', { returnObjects: true }) as string[]} />
          </Reveal>
          <Reveal
            variant="scale"
            className="relative order-first mx-auto mb-3 aspect-[1448/1086] w-full max-w-[980px] rounded-[28px] bg-[linear-gradient(165deg,#3b2f25,#1a140f)] shadow-[0_28px_70px_rgba(0,0,0,.55),0_0_100px_-30px_rgba(255,139,2,.45)] min-[960px]:col-span-full min-[960px]:mb-6"
          >
            {!imgFailed && (
              <img
                src="/website/forma-coach-led.webp"
                alt={t('coachLed.alt')}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 block h-full w-full rounded-[inherit] object-cover"
              />
            )}
            {/* centred in both directions (the design's RTL translate mirrored it off-centre) */}
            <span className="pointer-events-none absolute -bottom-4 left-1/2 z-[1] inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-brand px-4 py-[10px] font-mono text-[12px] font-medium uppercase tracking-[.04em] text-brand-ink shadow-glow rtl:normal-case rtl:tracking-normal">
              <Icon name="user" size={15} />
              <span>{t('coachLed.badge')}</span>
            </span>
          </Reveal>
          <Reveal d={1} className={cx(col, 'border-[rgba(255,139,2,.32)] bg-gradient-surface-hi')}>
            <p className={cx(capClass, 'my-[1em]')}>{t('coachLed.coachCap')}</p>
            <List items={t('coachLed.coach', { returnObjects: true }) as string[]} coach />
          </Reveal>
        </div>
      </SectionWrap>
    </Section>
  );
}
