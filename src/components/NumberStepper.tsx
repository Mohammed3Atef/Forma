import { Icon } from './Icon';
import { HAPTIC, vibrate } from '@/lib/haptics';

interface NumberStepperProps {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  suffix?: string;
  ariaLabel?: string;
}

/**
 * Large +/- stepper with an editable numeric field. Designed for one-handed,
 * mid-workout entry — big touch targets, tap to type, ± to nudge.
 */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  placeholder = '0',
  suffix,
  ariaLabel,
}: NumberStepperProps) {
  const bump = (delta: number) => {
    vibrate(HAPTIC.tap);
    const base = value ?? 0;
    const next = Math.min(max, Math.max(min, Math.round((base + delta) * 100) / 100));
    onChange(next);
  };

  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => bump(-step)}
        className="flex h-11 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-raised text-white transition-transform active:scale-90 active:bg-white/10"
        aria-label="decrease"
      >
        <Icon name="minus" size={18} />
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          type="number"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={value ?? ''}
          placeholder={placeholder}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : Number(v));
          }}
          className="h-11 w-full rounded-[10px] border border-line bg-surface-raised px-1 text-center font-mono text-base font-medium text-white placeholder:text-earth-subtle focus:border-brand/60 focus:outline-none"
          step={step}
        />
        {suffix && value != null && (
          <span className="pointer-events-none absolute bottom-0.5 end-1.5 text-[9px] text-slate-500">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => bump(step)}
        className="flex h-11 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-raised text-white transition-transform active:scale-90 active:bg-white/10"
        aria-label="increase"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
