import type { CSSProperties, ReactNode } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { useScrollScene } from '../hooks/useScrollScene';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { Wrap } from '../components/layout';
import { Kpi, MAv, MBub, MCard, mkClass, mnumClass, MPill, MRow, msClass, mtClass, UA_P } from '../components/mock';
import { Section } from '../components/Section';
import { d2Class, eyebrowClass, leadClass, Rich } from '../components/type';
import { ProgressStrip } from '../components/ProgressStrip';
import c from './chaos.module.css';

const OK = '#3FB27F';
const TX2 = '#ABA19B';

/** Fragment position/motion: desktop (l,t) / phone (lm,tm) slot, start offset (dx,dy) and tilt (r). */
type FragVars = { l: string; t: string; lm: string; tm: string; dx: number; dy: number; r: number };

function Frag({ v, tag, skin, skinClass, title, icon, children }: { v: FragVars; tag: string; skin: ReactNode; skinClass: string; title: string; icon: IconName; children: ReactNode }) {
  const style = { '--l': v.l, '--t': v.t, '--lm': v.lm, '--tm': v.tm, '--dx': v.dx, '--dy': v.dy, '--r': v.r } as CSSProperties;
  return (
    <div className={c.frag} style={style}>
      <span className={c.tag}>{tag}</span>
      <div className={cx(c.fa, skinClass)}>{skin}</div>
      <div className={c.fb}>
        <h5 className="m-0 flex items-center gap-[.55em] font-mono text-[.74em] font-medium uppercase tracking-[.08em] text-site-tx3">
          <Icon name={icon} size="1.3em" className="text-brand-hover" />
          {title}
        </h5>
        {children}
      </div>
    </div>
  );
}

function HeadCopy({ which, labelled }: { which: 'a' | 'b'; labelled?: boolean }) {
  const { t } = useSiteT();
  return (
    <div className={which === 'a' ? c.headA : c.headB} aria-hidden={which === 'b' || undefined}>
      <p className={eyebrowClass}>{t(`how.${which}.eyebrow`)}</p>
      <h2 id={labelled ? 'h-chaos' : undefined} className={d2Class}>
        <Rich k={`how.${which}.title`} />
      </h2>
      <p className={leadClass} style={{ marginInline: 'auto', textAlign: 'center' }}>
        {t(`how.${which}.lead`)}
      </p>
    </div>
  );
}

/** "Why Forma" — six scattered tools resolve into one client workspace as you scroll. */
export function How({ k }: { k: number }) {
  const { t } = useSiteT();
  const { ref, scrub, resolved } = useScrollScene<HTMLElement>();
  return (
    <Section
      id="how"
      k={k}
      sec={false}
      labelledBy="h-chaos"
      sectionRef={ref}
      className={cx(c.chaos, scrub && c.scrub, resolved && c.resolved)}
      glow={{ gx: '85%', gy: '30%', hx: '10%', hy: '85%' }}
    >
      <div className={c.pin}>
        <Wrap style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }}>
          <div className={c.heads}>
            <HeadCopy which="a" labelled />
            <HeadCopy which="b" />
          </div>
          <div dir="ltr" className={cx(c.stage, mkClass, 'rtl:font-sans', 'text-[clamp(6px,1.42cqw,12px)]')} role="img" aria-label={t('how.visual')}>
            <div className={c.frame} />
            <div className={c.head}>
              <MAv lg>SF</MAv>
              <div className="min-w-0 flex-1">
                <p className={cx(mtClass, UA_P)} style={{ fontSize: '1.35em' }}>
                  Salma Fathy
                </p>
                <p className={cx(msClass, UA_P)}>Hypertrophy · Phase 2 · Week 9 of 12</p>
              </div>
              <MPill tone="ok">Active</MPill>
              <MPill tone="brand" dot={false}>
                94% adherence
              </MPill>
            </div>

            <Frag
              v={{ l: '2.2%', t: '19%', lm: '2.2%', tm: '14.5%', dx: -6, dy: -8, r: -9 }}
              tag="Notes app"
              skinClass={c.skNote}
              skin={
                <>
                  Salma — shoulder?? <br />
                  ask about travel wk 3<br />
                  macros → 2050 ✓<br />
                  <s>bench 75</s> 80?
                </>
              }
              icon="note"
              title="Coach notes"
            >
              {['Right shoulder — neutral grip on overhead work.', 'Travels week 3 — front-load volume.'].map((note) => (
                <MCard key={note} style={{ padding: '.7em', background: '#241E1A' }}>
                  <p className={cx(msClass, UA_P)} style={{ whiteSpace: 'normal', color: TX2 }}>
                    {note}
                  </p>
                </MCard>
              ))}
            </Frag>

            <Frag
              v={{ l: '34.3%', t: '19%', lm: '50.2%', tm: '14.5%', dx: 3, dy: -12, r: 6 }}
              tag="Forms"
              skinClass={c.skForm}
              skin={
                <>
                  <div style={{ fontWeight: 700 }}>
                    Weekly check-in <span style={{ fontWeight: 400, color: '#888' }}>(14 responses)</span>
                  </div>
                  {[
                    ['Current weight', '61.8'],
                    ['Energy this week', 'good i think'],
                    ['Photos', 'sent on whatsapp'],
                  ].map(([q, a]) => (
                    <div key={q} className={c.q}>
                      <b>{q}</b>
                      {a}
                    </div>
                  ))}
                </>
              }
              icon="check"
              title="Check-in · Week 9"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5em' }}>
                <Kpi label="Weight" value="61.8" delta="−0.6" valueStyle={{ fontSize: '1.2em' }} />
                <Kpi label="Energy" value="Good" valueStyle={{ fontSize: '1.2em' }} />
              </div>
              <MPill tone="ok" style={{ alignSelf: 'flex-start' }}>
                Submitted
              </MPill>
            </Frag>

            <Frag
              v={{ l: '66.4%', t: '19%', lm: '2.2%', tm: '41.5%', dx: 9, dy: -6, r: 8 }}
              tag="WhatsApp"
              skinClass={c.skChat}
              skin={
                <>
                  <p>
                    Coach can I swap Thursday??<small>11:42</small>
                  </p>
                  <p className={c.r}>
                    sure do upper A sat<small>11:58 ✓✓</small>
                  </p>
                  <p>
                    ok also sending pics<small>12:03</small>
                  </p>
                </>
              }
              icon="msg"
              title="Messages"
            >
              <MBub style={{ fontSize: '.85em' }}>Can I move Thursday to Saturday?</MBub>
              <MBub me style={{ fontSize: '.85em' }}>
                Yes — Upper A on Saturday.
              </MBub>
            </Frag>

            <Frag
              v={{ l: '2.2%', t: '61.5%', lm: '50.2%', tm: '41.5%', dx: -9, dy: 7, r: 7 }}
              tag="Workout.pdf"
              skinClass={c.skPdf}
              skin={
                <>
                  <div className={c.top}>
                    <span>Workout_Plan_v3_FINAL(2).pdf</span>
                    <span>2.4 MB</span>
                  </div>
                  {['60%', undefined, '80%', '70%', '85%'].map((w, i) => (
                    <div key={i} className={c.ln} style={w ? { width: w } : undefined} />
                  ))}
                </>
              }
              icon="dumbbell"
              title="Workout · Upper A"
            >
              {[
                ['Bench press', '4 × 8'],
                ['Lat pulldown', '3 × 12'],
                ['Lateral raise', '3 × 15'],
              ].map(([name, rx]) => (
                <MRow key={name}>
                  <p className={cx(mtClass, UA_P, 'min-w-0 flex-1')} style={{ fontSize: '.9em' }}>
                    {name}
                  </p>
                  <span className={cx(mnumClass, msClass)}>{rx}</span>
                </MRow>
              ))}
            </Frag>

            <Frag
              v={{ l: '34.3%', t: '61.5%', lm: '2.2%', tm: '68.5%', dx: -2, dy: 10, r: -6 }}
              tag="Progress.jpg"
              skinClass={c.skPhotos}
              skin={
                <>
                  {['IMG_4021', 'IMG_4388', 'IMG_4790', 'IMG_5102', 'IMG_5215', 'IMG_5340'].map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </>
              }
              icon="camera"
              title="Progress photos"
            >
              <ProgressStrip className="min-h-0 flex-1 object-contain" />
            </Frag>

            <Frag
              v={{ l: '66.4%', t: '61.5%', lm: '50.2%', tm: '68.5%', dx: 7, dy: 9, r: -8 }}
              tag="Measurements.xlsx"
              skinClass={c.skSheet}
              skin={
                <>
                  {['', 'A', 'B', 'C'].map((h, i) => (
                    <span key={`h${i}`} className={c.h}>
                      {h}
                    </span>
                  ))}
                  {[
                    ['1', 'date', 'waist', 'hips'],
                    ['2', '3/8', '73', '95'],
                    ['3', '17/8', '72.5', '#REF!'],
                    ['4', '1/9', '71', '94'],
                    ['5', '', '', ''],
                  ].map((row) =>
                    row.map((cell, i) => (
                      <span key={`${row[0]}-${i}`} className={i === 0 ? c.h : undefined}>
                        {cell}
                      </span>
                    )),
                  )}
                </>
              }
              icon="ruler"
              title="Measurements"
            >
              {[
                ['Waist', '−2.0', '71 cm'],
                ['Hips', '−1.0', '94 cm'],
                ['Arm', '+0.5', '30.5 cm'],
              ].map(([label, delta, value]) => (
                <MRow key={label}>
                  <p className={cx(msClass, UA_P, 'min-w-0 flex-1')}>{label}</p>
                  <span className={mnumClass} style={{ color: OK, fontSize: '.8em' }}>
                    {delta}
                  </span>
                  <span className={mnumClass}>{value}</span>
                </MRow>
              ))}
            </Frag>
          </div>
        </Wrap>
      </div>
    </Section>
  );
}
