/**
 * Lightweight, dependency-free charts in the Forma design-system style.
 * (Recharts is still available elsewhere, but these match the design exactly.)
 */
import { useId } from 'react';
import { colors } from '@/theme/colors';

const COPPER = colors.brandOrange;
const TRACK = 'rgba(255,238,228,0.16)';
const SUBTLE = 'rgba(255,238,228,0.4)';

export interface BarDatum {
  label: string;
  value: number;
}

/** Weekly-volume style bar chart; the last bar is highlighted copper. */
export function BarChart({
  data,
  height = 150,
  format = (v: number) => String(v),
}: {
  data: BarDatum[];
  height?: number;
  format?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height }}>
      {data.map((d, i) => {
        const h = max ? Math.max(4, (d.value / max) * (height - 30)) : 4;
        const isNow = i === data.length - 1;
        return (
          <div
            key={i}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <div className="font-mono text-[9px]" style={{ color: SUBTLE }}>
              {d.value ? format(d.value) : ''}
            </div>
            <div
              className="w-full max-w-[26px] rounded-[7px] transition-[height] duration-500 ease-card"
              style={{ height: h, background: isNow ? COPPER : TRACK }}
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
  );
}

/** Bodyweight-style line chart with soft copper area fill + end dot. */
export function LineChart({
  data,
  height = 160,
  unit = 'kg',
  emptyLabel = 'Not enough data yet',
}: {
  data: number[];
  height?: number;
  unit?: string;
  emptyLabel?: string;
}) {
  const areaGradId = useId();
  const lineGradId = useId();
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center px-4 text-center font-mono text-xs"
        style={{ height, color: SUBTLE }}
      >
        {emptyLabel}
      </div>
    );
  }
  const W = 360;
  const H = height;
  const pad = 24;
  const min = Math.min(...data) - 0.6;
  const max = Math.max(...data) + 0.6;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${path} L ${x(data.length - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
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
          y1={pad + t * (H - pad * 2)}
          y2={pad + t * (H - pad * 2)}
          stroke="rgba(255,238,228,0.09)"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill={`url(#${areaGradId})`} />
      <path d={path} fill="none" stroke={`url(#${lineGradId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="5.5" fill={COPPER} />
      <circle cx={last[0]} cy={last[1]} r="10" fill={COPPER} opacity="0.18" />
      <text x={pad} y={14} fill={SUBTLE} className="font-mono" style={{ fontSize: 9 }}>
        {max.toFixed(0)} {unit}
      </text>
      <text x={pad} y={H - 6} fill={SUBTLE} className="font-mono" style={{ fontSize: 9 }}>
        {min.toFixed(0)} {unit}
      </text>
    </svg>
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
export function DonutChart({ data, centerLabel, size = 130 }: { data: DonutSlice[]; centerLabel?: string; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {data.map((d, i) => {
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
          <span className="font-mono text-xl text-earth">{total}</span>
          {centerLabel && <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-earth-subtle">{centerLabel}</span>}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((d, i) => (
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
