/**
 * Lightweight, dependency-free charts in the MyRocky style.
 * (Recharts is still available elsewhere, but these match the design exactly.)
 */

const COPPER = '#E5520F';
const TRACK = 'rgba(230,226,220,0.16)';
const SUBTLE = 'rgba(230,226,220,0.40)';

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
        <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COPPER} stopOpacity="0.28" />
          <stop offset="100%" stopColor={COPPER} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t, i) => (
        <line
          key={i}
          x1={pad}
          x2={W - pad}
          y1={pad + t * (H - pad * 2)}
          y2={pad + t * (H - pad * 2)}
          stroke="rgba(230,226,220,0.09)"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="url(#lcg)" />
      <path d={path} fill="none" stroke={COPPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
