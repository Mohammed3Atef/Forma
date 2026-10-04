import { useSiteT } from '../hooks/useSiteLang';
import { Halo } from '../components/layout';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { SiteButton } from '../components/SiteButton';
import { d2Class, leadClass, Rich } from '../components/type';

/** Closing call to action over a warm glow (design .final). */
export function FinalCta({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section k={k} grain sec={false} labelledBy="h-final" className="overflow-hidden py-[clamp(110px,14vw,190px)] text-center">
      <Halo
        style={{
          opacity: 1,
          filter: 'blur(30px)',
          width: 'min(900px,120vw)',
          height: 520,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(closest-side,rgba(255,139,2,.32),rgba(255,76,1,.08) 60%,transparent)',
        }}
      />
      <SectionWrap>
        <Reveal as="div" className="mx-auto mb-11 w-[min(420px,72vw)]">
          <img src="/website/forma-lockup.webp" alt={t('final.lockupAlt')} className="block w-full" />
        </Reveal>
        <Reveal as="h2" d={1} id="h-final" className={d2Class}>
          <Rich k="final.title" />
        </Reveal>
        <Reveal as="p" className={leadClass} style={{ margin: '22px auto 36px', textAlign: 'center' }}>
          {t('final.lead')}
        </Reveal>
        <Reveal d={2} className="flex justify-center">
          <SiteButton auth="signup" arrow style={{ minHeight: 56, padding: '0 34px' }}>
            <span>{t('shell.start')}</span>
          </SiteButton>
        </Reveal>
      </SectionWrap>
    </Section>
  );
}
