import type { ReactNode } from 'react';
import { GridBg, Halo } from '../components/layout';
import { Section, SectionWrap } from '../components/Section';
import { d1Class, eyebrowClass } from '../components/type';

/**
 * Sub-page hero (design .phero) for Contact and the legal pages: eyebrow,
 * display title, then whatever the page puts underneath.
 */
export function PageHero({
  eyebrow,
  title,
  titleSize,
  grain,
  ambient,
  halo,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  titleSize: string;
  grain?: boolean;
  ambient?: boolean;
  halo?: boolean;
  children?: ReactNode;
}) {
  return (
    <Section k={0} sec={false} grain={grain} ambient={ambient} className="overflow-clip pb-[clamp(40px,5vw,64px)] pt-[clamp(130px,15vw,170px)]">
      <GridBg style={{ opacity: 0.55 }} />
      {halo && <Halo style={{ width: 560, height: 420, background: 'rgba(255,139,2,.2)', insetInlineEnd: -140, top: 0 }} />}
      <SectionWrap className="flex flex-col gap-[18px]">
        <p className={eyebrowClass}>{eyebrow}</p>
        <h1 className={d1Class} style={{ fontSize: titleSize }}>
          {title}
        </h1>
        {children}
      </SectionWrap>
    </Section>
  );
}
