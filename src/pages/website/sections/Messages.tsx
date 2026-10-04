import type { ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { ProductFrame } from '../components/frames';
import { MAv, MBar, MBtn, MBub, MCard, MIc, mlClass, mnumClass, MRow, msClass, mtClass, UA_P, Wave } from '../components/mock';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { SecHead } from '../components/type';

const CAPS: [IconName, string][] = [
  ['msg', 'text'],
  ['image', 'images'],
  ['video', 'video'],
  ['file', 'files'],
  ['mic', 'voice'],
  ['smile', 'reactions'],
  ['check', 'seen'],
];

/** Small "alongside" card in the chat side panel. */
function SideCard({ children }: { children: ReactNode }) {
  return <MCard style={{ background: '#141110' }}>{children}</MCard>;
}

/** The conversation mock (design .chat): thread + the client's coaching alongside (≥620px frame). */
function Chat() {
  return (
    <div className="grid min-h-[34em] grid-cols-1 [@container(min-width:620px)]:grid-cols-[1fr_17em]">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-[.9em] border-b border-site-line bg-surface-raised px-[1.4em] py-[1.1em]">
          <MAv>SF</MAv>
          <div className="min-w-0 flex-1">
            <p className={cx(mtClass, UA_P)}>Salma Fathy</p>
            <p className={cx(msClass, UA_P)} style={{ color: '#3FB27F' }}>
              ● Active now
            </p>
          </div>
          <MBtn sec style={{ height: '2.3em', padding: '0 1em' }}>
            Open workspace
          </MBtn>
        </div>
        <div className="flex flex-1 flex-col gap-[.75em] p-[1.4em]">
          <p className={cx(mlClass, UA_P)} style={{ textAlign: 'center' }}>
            Today
          </p>
          <MBub>Finished Upper A — bench felt easy today</MBub>
          <div className="relative grid aspect-[16/10] w-[13em] place-items-center self-end rounded-[1em] bg-[linear-gradient(150deg,#3a2c1e,#241a12_60%,#140d08)]">
            <span className="grid h-[2.8em] w-[2.8em] place-items-center rounded-full border-[1.5px] border-[rgba(255,255,255,.6)] text-white">
              <Icon name="play" style={{ width: '1.1em' }} />
            </span>
            <small className="absolute bottom-[.6em] end-[.7em] rounded-full bg-[rgba(0,0,0,.5)] px-[.5em] py-[.1em] font-mono text-[.72em]">0:24</small>
          </div>
          <MBub me>Form looks solid. Same load, add a rep next week.</MBub>
          <span className="-mt-[.6em] ms-[1em] inline-flex items-center gap-[.3em] self-start rounded-full border border-site-line2 bg-surface-strong px-[.6em] py-[.2em] font-mono text-[.72em] text-rose">
            <Icon name="heart" style={{ width: '1em', height: '1em' }} />1
          </span>
          {/* voice note bubble (design .m-bub.them.voice) */}
          <MBub className="flex min-w-[15em] items-center gap-[.7em]" style={{ color: '#F8F4F1' }}>
            <span className="grid h-[2.2em] w-[2.2em] flex-none place-items-center rounded-full" style={{ background: 'rgba(255,238,228,.1)' }}>
              <Icon name="play" style={{ width: '.9em' }} />
            </span>
            <span className="flex h-[1.8em] flex-1 items-center gap-[2px]">
              <Wave />
            </span>
            <span className={mnumClass} style={{ fontSize: '.8em' }}>
              0:18
            </span>
          </MBub>
          <div className="flex min-w-[14em] items-center gap-[.7em] self-end rounded-[1em] border border-[rgba(255,139,2,.3)] bg-site-brand-tint px-[1em] py-[.7em]">
            <MIc name="file" style={{ background: '#1B1714', color: '#FFB208' }} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={{ fontSize: '.9em' }}>
                Week10_Plan.pdf
              </p>
              <p className={cx(msClass, UA_P)}>PDF · 240 KB</p>
            </div>
          </div>
          <p className={cx(UA_P, 'flex items-center gap-[.3em] self-end font-mono text-[.7em] text-site-tx3')}>
            <Icon name="check" size="1.1em" className="text-brand-hover" />
            Seen 19:42
          </p>
        </div>
        <div className="flex items-center gap-[.7em] border-t border-site-line px-[1.4em] py-[1em]">
          <span className="grid h-[2.9em] w-[2.9em] flex-none place-items-center rounded-full p-0" style={{ background: '#1B1714', color: '#7C726C' }}>
            <Icon name="clip" size="1.2em" className="block" />
          </span>
          <span className="flex h-[2.9em] flex-1 items-center rounded-full border border-site-line2 bg-surface-raised px-[1.1em] text-[.9em] text-site-tx4">Write a message…</span>
          <span className="grid h-[2.9em] w-[2.9em] flex-none place-items-center rounded-full bg-gradient-brand p-0 text-brand-ink">
            <Icon name="mic" size="1.2em" className="block" />
          </span>
        </div>
      </div>
      <div className="hidden flex-col gap-[.9em] border-s border-site-line bg-surface-raised p-[1.3em] [@container(min-width:620px)]:flex">
        <p className={cx(mlClass, UA_P)}>Salma's coaching · alongside</p>
        <SideCard>
          <MRow>
            <MIc name="dumbbell" style={{ background: 'rgba(63,178,127,.14)', color: '#3FB27F' }} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={{ fontSize: '.9em' }}>
                Upper A
              </p>
              <p className={cx(msClass, UA_P)}>Done · 21 sets</p>
            </div>
          </MRow>
        </SideCard>
        <SideCard>
          <MRow>
            <MIc name="check" style={{ background: 'rgba(91,141,239,.14)', color: '#5B8DEF' }} />
            <div className="min-w-0 flex-1">
              <p className={cx(mtClass, UA_P)} style={{ fontSize: '.9em' }}>
                Week 9 check-in
              </p>
              <p className={cx(msClass, UA_P)}>61.8 kg · to review</p>
            </div>
          </MRow>
        </SideCard>
        <SideCard>
          <p className={cx(mlClass, UA_P)}>Adherence · 4 wks</p>
          <p className={mnumClass} style={{ fontSize: '1.6em', margin: '.2em 0 .4em' }}>
            94%
          </p>
          <MBar value="94%" />
        </SideCard>
        <SideCard>
          <p className={cx(mlClass, UA_P)}>Next</p>
          <p className={cx(msClass, UA_P)} style={{ color: '#ABA19B', marginTop: '.3em' }}>
            Check-in due Monday
          </p>
        </SideCard>
      </div>
    </div>
  );
}

/** Messaging — the conversation lives next to the coaching. */
export function Messages({ k }: { k: number }) {
  const { t } = useSiteT();
  return (
    <Section
      id="messages"
      k={k}
      labelledBy="h-msg"
      style={{ background: 'linear-gradient(180deg,transparent,#141110 25%,#141110 75%,transparent)' }}
      glow={{ gx: '88%', gy: '20%', hx: '12%', hy: '80%', gb: 'rgba(91,141,239,.07)' }}
    >
      <SectionWrap>
        <div className="grid items-start gap-[clamp(32px,5vw,64px)] min-[1000px]:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
          <SecHead ns="messages" id="h-msg" className="!mb-0">
            <div className="mt-6 flex flex-wrap gap-2">
              {CAPS.map(([icon, key]) => (
                <span key={key} className="inline-flex items-center gap-2 rounded-full border border-site-line2 bg-surface-card px-[14px] py-[9px] text-[14px] text-earth">
                  <Icon name={icon} style={{ width: 15 }} className="text-brand-hover" />
                  <b className="font-normal">{t(`messages.caps.${key}`)}</b>
                </span>
              ))}
            </div>
          </SecHead>
          <Reveal variant="scale" d={1}>
            <ProductFrame>
              <Chat />
            </ProductFrame>
          </Reveal>
        </div>
      </SectionWrap>
    </Section>
  );
}
