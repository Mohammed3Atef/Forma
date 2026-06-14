interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

/** SVG progress ring used for completion %, macros, and timers. */
export function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  color = '#AE7E56',
  trackColor = 'rgba(230,226,220,0.12)',
  label,
  sublabel,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const offset = c * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {(label || sublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {label && <span className="font-mono text-base font-medium leading-none">{label}</span>}
          {sublabel && <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-earth-muted">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
