/**
 * Lightweight, dependency-free charts in the Forma design-system style.
 * (Recharts is still available elsewhere, but these match the design exactly.)
 */
import { useId, useRef, useState } from 'react';
import { colors } from '@/theme/colors';

const COPPER = colors.brandOrange;
const TRACK = 'rgba(255,238,228,0.16)';
const SUBTLE = 'rgba(255,238,228,0.4)';

/** `date` (ISO `YYYY-MM-DD`) is optional per-datum — when every point has one, the x-axis is spaced by real elapsed time and shows real date ticks instead of even index spacing. */
export interface BarDatum {
  label: string;
  value: number;
  date?: string;
}

function localeFor(locale: string): string {
  return locale.startsWith('ar') ? 'ar-EG' : 'en-GB';
}
function shortTick(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(localeFor(locale), { day: 'numeric', month: 'short' });
}

/**
 * A small, consistent hover/tap tooltip shared by every chart here: exact
 * category/date · exact value · unit, positioned as a percentage of the
 * chart's own width so it tracks correctly at any rendered size (mobile or
 * desktop) without a resize observer.
 */
function ChartTooltip({ leftPct, title, value }: { leftPct: number; title: string; value: string }) {
  const clamped = Math.min(92, Math.max(8, leftPct));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface-raised px-2 py-1 text-[11px] shadow-deep"
      style={{ left: `${clamped}%` }}
      role="status"
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-earth-subtle">{title}</div>
      <div className="font-mono font-medium tabular-nums text-earth">{value}</div>
    </div>
  );
}

/**
 * Weekly-volume style bar chart; the last bar is highlighted copper — correct
 * ONLY for a genuine trailing time series (the array's last element really is
 * "now"). Never use this for a categorical ranking (e.g. clients sorted by
 * activity) — nothing array-order there means "most recent".
 */
export function BarChart({
  data,
  height = 150,
  format = (v: number) => String(v),
  unit = '',
  locale = 'en',
  emptyLabel = 'Not enough data yet',
}: {
  data: BarDatum[];
  height?: number;
  format?: (v: number) => string;
  unit?: string;
  locale?: string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hasAny = data.length > 0 && data.some((d) => d.value !== 0);
  if (!hasAny) {
    return (
      <div className="flex items-center justify-center px-4 text-center font-mono text-xs" style={{ height, color: SUBTLE }}>
        {emptyLabel}
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="relative">
      {/* Screen-reader-only textual equivalent — the visual chart is
          decorative/redundant with this list, not the sole carrier of the data. */}
      <ul className="sr-only">
        {data.map((d, i) => (
          <li key={i}>{d.date ? shortTick(d.date, locale) : d.label}: {format(d.value)}{unit ? ` ${unit}` : ''}</li>
        ))}
      </ul>
      {hover != null && (
        <ChartTooltip
          leftPct={((hover + 0.5) / data.length) * 100}
          title={data[hover].date ? shortTick(data[hover].date, locale) : data[hover].label}
          value={`${format(data[hover].value)}${unit ? ` ${unit}` : ''}`}
        />
      )}
      {/* `dir="ltr"` — a plain `flex` row otherwise lays its children out
          right-to-left under the page's RTL direction, which would silently
          reverse this chart's chronological order (oldest bar on the right)
          even though every bar is still individually labeled. Time always
          reads oldest→newest left-to-right here, in every locale — not
          mirrored just because the page is RTL. */}
      <div dir="ltr" className="flex items-end gap-2 pt-6" style={{ height }}>
        {data.map((d, i) => {
          const h = max ? Math.max(4, (d.value / max) * (height - 30)) : 4;
          const isNow = i === data.length - 1;
          return (
            <div
              key={i}
              // Keyboard-focusable so the per-bar tooltip isn't mouse/touch-only.
              tabIndex={0}
              role="img"
              aria-label={`${d.date ? shortTick(d.date, locale) : d.label}: ${format(d.value)}${unit ? ` ${unit}` : ''}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h2) => (h2 === i ? null : h2))}
              onTouchStart={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h2) => (h2 === i ? null : h2))}
            >
              <div className="font-mono text-[9px]" style={{ color: SUBTLE }}>
                {d.value ? format(d.value) : ''}
              </div>
              <div
                className="w-full max-w-[26px] rounded-[7px] transition-[height] duration-500 ease-card motion-reduce:transition-none"
                style={{ height: h, background: isNow ? COPPER : hover === i ? colors.brandOrangeHover : TRACK }}
              />
              <div
                className="font-mono text-[9.5px] tracking-[0.04em]"
                style={{ color: isNow ? COPPER : SUBTLE }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One point on a `LineChart`. `date` (`YYYY-MM-DD`) drives real time-proportional x-spacing + date tick labels when every point has one; omit it to fall back to even index spacing (e.g. a value with no meaningful calendar date). */
export interface LinePoint {
  value: number;
  date?: string;
}

/** Bodyweight-style line chart with soft copper area fill + end dot. */
export function LineChart({
  data,
  height = 160,
  unit = 'kg',
  emptyLabel = 'Not enough data yet',
  locale = 'en',
}: {
  data: number[] | LinePoint[];
  height?: number;
  unit?: string;
  emptyLabel?: string;
  locale?: string;
}) {
  const areaGradId = useId();
  const lineGradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const points: LinePoint[] = data.length && typeof data[0] === 'number' ? (data as number[]).map((value) => ({ value })) : (data as LinePoint[]);
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center px-4 text-center font-mono text-xs"
        style={{ height, color: SUBTLE }}
      >
        {emptyLabel}
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const W = 360;
  const H = height;
  const pad = 24;
  const AXIS_PAD = 16; // room for date ticks below the plot
  const min = Math.min(...values) - 0.6;
  const max = Math.max(...values) + 0.6;
  const hasDates = points.every((p) => !!p.date);
  const times = hasDates ? points.map((p) => new Date(p.date!).getTime()) : null;
  const tMin = times ? Math.min(...times) : 0;
  const tMax = times ? Math.max(...times) : 0;
  const timeSpread = !!times && tMax > tMin;
  const x = (i: number) => (timeSpread ? pad + ((times![i] - tMin) / (tMax - tMin)) * (W - pad * 2) : pad + (i / (points.length - 1)) * (W - pad * 2));
  const y = (v: number) => H - pad - AXIS_PAD - ((v - min) / (max - min || 1)) * (H - pad * 2 - AXIS_PAD);
  const pts = points.map((p, i) => [x(i), y(p.value)] as const);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${path} L ${x(points.length - 1)} ${H - pad - AXIS_PAD} L ${x(0)} ${H - pad - AXIS_PAD} Z`;
  const last = pts[pts.length - 1];

  // Up to 3 date ticks (first / middle / last) — never one per point, which
  // would overlap and be unreadable on mobile with more than a few entries.
  const tickIdx = hasDates ? [...new Set([0, Math.round((points.length - 1) / 2), points.length - 1])] : [];

  const nearestIndex = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const svgX = frac * W;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p[0] - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  };

  return (
    // `dir="ltr"` — the plot's x/y math is physical-coordinate-based (oldest
    // point at the physical left), and SVG `text-anchor` can otherwise
    // resolve logically under an inherited RTL `direction` (a CSS property,
    // which this div then passes down to the svg without React's SVGProps
    // rejecting a `dir` attribute directly on the svg element).
    <div className="relative" dir="ltr">
      {/* Screen-reader-only textual equivalent — the visual chart is
          decorative/redundant with this list, not the sole carrier of the data. */}
      <ul className="sr-only">
        {points.map((p, i) => (
          <li key={i}>{p.date ? shortTick(p.date, locale) : `#${i + 1}`}: {p.value} {unit}</li>
        ))}
      </ul>
      {hover != null && (
        <ChartTooltip
          leftPct={(x(hover) / W) * 100}
          title={points[hover].date ? shortTick(points[hover].date!, locale) : String(hover + 1)}
          value={`${values[hover]} ${unit}`}
        />
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        onMouseMove={(e) => setHover(nearestIndex(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(nearestIndex(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(nearestIndex(e.touches[0].clientX))}
      >
        <defs>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COPPER} stopOpacity="0.28" />
            <stop offset="100%" stopColor={COPPER} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.brandOrangeHover} />
            <stop offset="100%" stopColor={colors.brandOrangePressed} />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t, i) => (
          <line
            key={i}
            x1={pad}
            x2={W - pad}
            y1={pad + t * (H - pad * 2 - AXIS_PAD)}
            y2={pad + t * (H - pad * 2 - AXIS_PAD)}
            stroke="rgba(255,238,228,0.09)"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill={`url(#${areaGradId})`} />
        <path d={path} fill="none" stroke={`url(#${lineGradId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {hover != null && (
          <line x1={pts[hover][0]} x2={pts[hover][0]} y1={pad * 0.3} y2={H - pad - AXIS_PAD} stroke={SUBTLE} strokeWidth="1" strokeDasharray="2 3" />
        )}
        <circle cx={last[0]} cy={last[1]} r="5.5" fill={COPPER} />
        <circle cx={last[0]} cy={last[1]} r="10" fill={COPPER} opacity="0.18" />
        {hover != null && hover !== points.length - 1 && <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4" fill={colors.brandOrangeHover} />}
        <text x={pad} y={14} fill={SUBTLE} className="font-mono" style={{ fontSize: 9 }}>
          {max.toFixed(0)} {unit}
        </text>
        <text x={pad} y={H - AXIS_PAD - 6} fill={SUBTLE} className="font-mono" style={{ fontSize: 9 }}>
          {min.toFixed(0)} {unit}
        </text>
        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fill={SUBTLE}
            className="font-mono"
            style={{ fontSize: 8.5 }}
          >
            {shortTick(points[i].date!, locale)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** One slice of a `DonutChart`. */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Simple ring/donut chart — a center value + a legend, matching the design's
 * role-distribution donut. Stroke-based (no external chart lib): each slice is
 * a circle segment via `stroke-dasharray`/`stroke-dashoffset`.
 */
export function DonutChart({ data, centerLabel, size = 130, emptyLabel = 'Not enough data yet' }: { data: DonutSlice[]; centerLabel?: string; size?: number; emptyLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center px-4 text-center font-mono text-xs" style={{ height: size, color: SUBTLE }}>
        {emptyLabel}
      </div>
    );
  }
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {shown.map((d, i) => {
            const frac = total ? d.value / total : 0;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={16}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl tabular-nums text-earth">{total}</span>
          {centerLabel && <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-earth-subtle">{centerLabel}</span>}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {shown.map((d, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 font-mono text-[9.5px] text-earth-subtle">
            <i className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: d.color }} />
            {d.label} · {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Tiny inline sparkline. */
export function Spark({ data, w = 70, h = 26 }: { data: number[]; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6)] as const);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} className="block">
      <path d={path} fill="none" stroke={COPPER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
