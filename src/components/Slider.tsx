/** Range slider with a live value label, styled for the Forma dark theme. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
  testId,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  testId?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] text-earth-subtle">{format(min)}</span>
        <span className="font-mono text-lg text-brand">{format(value)}</span>
        <span className="font-mono text-[11px] text-earth-subtle">{format(max)}</span>
      </div>
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-brand"
      />
    </div>
  );
}
