import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { HAPTIC, vibrate } from '@/lib/haptics';
import { normalizeNumericText, parseDecimalOrNull } from '@/lib/utils';

/**
 * The ONE number entry (B1.8 / RTL-04, B1.3). Replaces `NumberStepper`, the
 * workout `NumericCell` and raw `inputMode` inputs.
 *
 *  - Understands Latin digits, Arabic-Indic and Persian digits, the Arabic
 *    decimal separator (٫), comma decimals and pasted direction marks — all via
 *    the one shared normaliser (`normalizeNumericText`).
 *  - A text field with a numeric keypad (never `type="number"`, which rejects
 *    Arabic-Indic digits). Holds the typed text while focused, so "80." and
 *    "٨٠٫٥" can be typed; re-syncs from `value` when idle.
 *  - Digits are shown left-to-right in every language (spec §15: Latin digits).
 *  - `invalid: 'reject'` ignores a keystroke that can't be part of a number
 *    (live-session cells); `invalid: 'flag'` keeps the text, marks the field
 *    invalid and reports `null` (forms that must say why they can't save).
 *  - Sizes: `standard` 44px, `workout` 56px (gym-critical). Steppers are ≥44px.
 *  - Keyboard: ArrowUp/ArrowDown nudge by `step` when `stepper` is on.
 */
export interface NumericFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Whole numbers only (sets, reps, months). */
  integer?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Show − / + buttons. */
  stepper?: boolean;
  size?: 'standard' | 'workout';
  /** Visible label (sentence case). Use `ariaLabel` when the label is elsewhere. */
  label?: string;
  ariaLabel?: string;
  /** Unit shown inside the field (from i18n, e.g. "kg"). */
  suffix?: string;
  placeholder?: string;
  invalid?: 'reject' | 'flag';
  /** Externally marked invalid (e.g. "enter the reps first"). */
  error?: boolean | string;
  /** Called with the validity of the current text (only meaningful with `invalid: 'flag'`). */
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  id?: string;
  testId?: string;
  /** Extra classes for the wrapper / the input (legacy grids keep their own cell styling). */
  className?: string;
  inputClassName?: string;
}

const text = (v: number | null) => (v == null ? '' : String(v));

export function NumericField({
  value,
  onChange,
  integer = false,
  min,
  max,
  step = 1,
  stepper = false,
  size = 'standard',
  label,
  ariaLabel,
  suffix,
  placeholder,
  invalid = 'reject',
  error,
  onValidityChange,
  disabled,
  id,
  testId,
  className = '',
  inputClassName,
}: NumericFieldProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const inputId = id ?? autoId;
  const [raw, setRaw] = useState(text(value));
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!focused) {
      setRaw(text(value));
      setBad(false);
    }
  }, [value, focused]);

  const pattern = integer ? /^\d*$/ : /^\d*\.?\d*$/;
  const onInput = (input: string) => {
    const norm = normalizeNumericText(input);
    if (pattern.test(norm)) {
      setRaw(norm);
      if (bad) {
        setBad(false);
        onValidityChange?.(true);
      }
      onChange(norm === '' || norm === '.' ? null : parseDecimalOrNull(norm));
      return;
    }
    if (invalid === 'reject') return; // not part of a number — ignored
    setRaw(input);
    setBad(true);
    onValidityChange?.(false);
    onChange(null);
  };

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const bump = (delta: number) => {
    vibrate(HAPTIC.tap);
    const next = clamp(Math.round(((value ?? 0) + delta) * 100) / 100);
    onChange(integer ? Math.round(next) : next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!stepper) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bump(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bump(-step);
    }
  };

  const isInvalid = bad || !!error;
  const h = size === 'workout' ? 'h-14 text-lg' : 'h-11 text-base';
  const input = (
    <input
      id={inputId}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      dir="ltr"
      autoComplete="off"
      aria-label={label ? undefined : ariaLabel}
      aria-invalid={isInvalid || undefined}
      data-testid={testId}
      disabled={disabled}
      value={raw}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => onInput(e.target.value)}
      onKeyDown={onKeyDown}
      className={
        inputClassName ??
        `${h} w-full min-w-0 rounded-ui-control border bg-ui-raised px-2 text-center t-numeric font-medium text-ui-primary placeholder:text-ui-muted focus:outline-none disabled:opacity-50 ${
          isInvalid ? 'border-ui-warning' : 'border-ui-border focus:border-ui-accent/60'
        }`
      }
    />
  );
  const field = suffix ? (
    <div className="relative min-w-0 flex-1">
      {input}
      {raw !== '' && <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 t-caption text-ui-muted">{suffix}</span>}
    </div>
  ) : (
    <div className="min-w-0 flex-1">{input}</div>
  );
  const stepBtn = `flex ${size === 'workout' ? 'h-14 w-14' : 'h-11 w-11'} shrink-0 items-center justify-center rounded-ui-control border border-ui-border bg-ui-raised text-ui-primary transition-transform duration-ui-fast active:scale-95 disabled:opacity-40`;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block t-label text-ui-secondary">
          {label}
        </label>
      )}
      <div className="flex items-stretch gap-1.5">
        {stepper && (
          <button type="button" className={stepBtn} disabled={disabled} onClick={() => bump(-step)} aria-label={t('common.decrease')} aria-controls={inputId}>
            <Icon name="minus" size={18} />
          </button>
        )}
        {field}
        {stepper && (
          <button type="button" className={stepBtn} disabled={disabled} onClick={() => bump(step)} aria-label={t('common.increase')} aria-controls={inputId}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      {typeof error === 'string' && error && (
        <p role="alert" className="mt-1 t-caption text-ui-warning">
          {error}
        </p>
      )}
    </div>
  );
}
