import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { MAv } from '../components/mock';
import { Reveal, useRevealed } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { SecHead } from '../components/type';
import { GridBg } from '../components/layout';
import s from './system.module.css';

interface MapNode {
  key: string;
  icon?: IconName;
  /** desktop position (16:9.4) */
  x: string;
  y: string;
  /** phone position (4:5) */
  mx: string;
  my: string;
}
const NODES: MapNode[] = [
  { key: 'coach', icon: 'user', x: '50%', y: '8%', mx: '50%', my: '6%' },
  { key: 'client', x: '50%', y: '54%', mx: '50%', my: '50%' },
  { key: 'workout', icon: 'dumbbell', x: '16%', y: '28%', mx: '23%', my: '24%' },
  { key: 'messages', icon: 'msg', x: '84%', y: '28%', mx: '77%', my: '24%' },
  { key: 'nutrition', icon: 'meal', x: '10%', y: '57%', mx: '20%', my: '50%' },
  { key: 'checkins', icon: 'check', x: '90%', y: '57%', mx: '80%', my: '50%' },
  { key: 'cardio', icon: 'activity', x: '22%', y: '86%', mx: '23%', my: '76%' },
  { key: 'progress', icon: 'chart', x: '78%', y: '86%', mx: '77%', my: '76%' },
  { key: 'assessment', icon: 'note', x: '50%', y: '95%', mx: '50%', my: '94%' },
];

interface Line {
  d: string;
  cx: number;
  cy: number;
  soft: boolean;
}

/** Connector geometry (design map script): from the core's edge to each node's facing side, gently curved. */
function measure(map: HTMLElement): { lines: Line[]; w: number; h: number } {
  const m = map.getBoundingClientRect();
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { r, x: r.left - m.left + r.width / 2, y: r.top - m.top + r.height / 2 };
  };
  const coreEl = map.querySelector('[data-core]');
  if (!coreEl) return { lines: [], w: m.width, h: m.height };
  const C = box(coreEl);
  const edge = (r: DOMRect, cx: number, cy: number, tx: number, ty: number) => {
    const dx = tx - cx,
      dy = ty - cy,
      hw = r.width / 2 + 2,
      hh = r.height / 2 + 2;
    const k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
    return [cx + dx * k, cy + dy * k];
  };
  const lines: Line[] = [];
  map.querySelectorAll('[data-node]').forEach((n) => {
    const N = box(n);
    let x2: number, y2: number;
    if (Math.abs(N.x - C.x) < 4) {
      x2 = N.x;
      y2 = N.y + (N.y < C.y ? 1 : -1) * (N.r.height / 2 + 2);
    } else {
      x2 = N.x + (N.x < C.x ? 1 : -1) * (N.r.width / 2 + 2);
      y2 = N.y;
    }
    const [x1, y1] = edge(C.r, C.x, C.y, x2, y2);
    const qx = (x1 + x2) / 2,
      qy = Math.abs(y2 - y1) < 4 ? y1 : y1 * 0.35 + y2 * 0.65;
    const d =
      Math.abs(x2 - x1) < 4
        ? `M${x1} ${y1} L${x2} ${y2}`
        : `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    lines.push({ d, cx: x2, cy: y2, soft: n.hasAttribute('data-soft') });
  });
  return { lines, w: m.width, h: m.height };
}

function MapCanvas() {
  const { t, lang } = useSiteT();
  const inView = useRevealed();
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ lines: Line[]; w: number; h: number }>({ lines: [], w: 0, h: 0 });

  // Re-measure on size changes, once web fonts settle, and when the language (labels/direction) changes.
  useLayoutEffect(() => {
    const map = ref.current;
    if (!map) return;
    let alive = true;
    const draw = () => alive && setGeo(measure(map));
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(map);
    map.querySelectorAll('[data-node],[data-core]').forEach((n) => ro.observe(n));
    void document.fonts?.ready.then(draw);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [lang]);

  return (
    <div ref={ref} className={cx(s.map, inView && s.in)}>
      <svg className={s.lines} viewBox={`0 0 ${geo.w || 1} ${geo.h || 1}`} aria-hidden="true">
        <defs>
          <linearGradient id="mapg" gradientUnits="userSpaceOnUse" x1="0" x2={geo.w || 1000} y1="0" y2="0">
            <stop offset="0" stopColor="#FFB208" />
            <stop offset=".5" stopColor="#FF8B02" />
            <stop offset="1" stopColor="#FFB208" />
          </linearGradient>
        </defs>
        <g>
          {geo.lines.map((l, i) => (
            <g key={i}>
              <path pathLength={1} className={l.soft ? 'soft' : ''} style={{ '--k': i } as CSSProperties} d={l.d} />
              <circle r="3" cx={l.cx.toFixed(1)} cy={l.cy.toFixed(1)} style={{ '--k': i } as CSSProperties} />
            </g>
          ))}
        </g>
      </svg>
      {NODES.map((n, k) => {
        const core = n.key === 'client';
        const coach = n.key === 'coach';
        const pos = { '--x': n.x, '--y': n.y, '--mx': n.mx, '--my': n.my, '--k': k } as CSSProperties;
        return (
          <div
            key={n.key}
            style={pos}
            data-core={core ? '' : undefined}
            data-node={core ? undefined : ''}
            data-soft={coach ? '' : undefined}
            className={cx(
              s.node,
              'flex items-center whitespace-nowrap border font-medium',
              // compact on phones (em of the map's own font-size), design sizes from 760px
              core
                ? 'flex-col gap-[.5em] rounded-[1.4em] border-[rgba(255,139,2,.35)] bg-gradient-surface-hi px-[1.4em] py-[1em] text-[1.1em] shadow-[0_28px_70px_rgba(0,0,0,.55),0_0_0_8px_rgba(255,139,2,.05)] min-[760px]:gap-[10px] min-[760px]:rounded-[24px] min-[760px]:px-[30px] min-[760px]:py-[22px] min-[760px]:text-[16px]'
                : cx(
                    'gap-[.55em] rounded-full py-[.45em] pe-[.95em] ps-[.45em] text-[1em] min-[760px]:gap-[10px] min-[760px]:py-[10px] min-[760px]:pe-4 min-[760px]:ps-[10px] min-[760px]:text-[14px]',
                    'shadow-site-2',
                    coach ? 'border-site-line3 bg-surface-raised' : 'border-site-line2 bg-surface-card',
                  ),
            )}
          >
            {core ? (
              <MAv lg className="max-[759px]:!text-[.85em]" style={{ fontSize: 16 }}>
                SF
              </MAv>
            ) : (
              <span
                className="grid h-[2.1em] w-[2.1em] flex-none place-items-center rounded-full min-[760px]:h-8 min-[760px]:w-8"
                style={coach ? { background: '#241E1A', color: '#F8F4F1' } : { background: 'rgba(255,139,2,.13)', color: '#FFB208' }}
              >
                <Icon name={n.icon!} size="1.1em" className="min-[760px]:!h-4 min-[760px]:!w-4" />
              </span>
            )}
            <span>{t(`system.nodes.${n.key}`)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** "Everything connects" — the client at the centre of every part of Forma. */
export function SystemMap({ k }: { k: number }) {
  return (
    <Section id="system" k={k} labelledBy="h-sys" glow={{ gx: '50%', gy: '50%', hx: '90%', hy: '10%', ga: 'rgba(255,139,2,.14)' }}>
      <GridBg style={{ opacity: 0.35 }} />
      <SectionWrap>
        <SecHead ns="system" id="h-sys" center />
        <Reveal>
          <MapCanvas />
        </Reveal>
      </SectionWrap>
    </Section>
  );
}

