import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumericField } from './NumericField';
import { normalizeNumericText, parseDecimal, parseNumber } from '@/lib/utils';

describe('one numeric normaliser (B1.8 / RTL-04)', () => {
  it('reads Western, Arabic-Indic and Persian digits, both decimal separators, the Arabic thousands mark and pasted bidi marks', () => {
    expect(parseNumber('١٠٠')).toBe(100);
    expect(parseNumber('۹۰٫۲۵')).toBe(90.25);
    expect(parseNumber('80,5')).toBe(80.5);
    expect(parseNumber('١٬٥٠٠')).toBe(1500);
    expect(parseNumber('⁨٧٥⁩')).toBe(75);
    expect(normalizeNumericText('‏٣‎')).toBe('3');
  });
  it('empty or unreadable is NaN for validation (never a silent 0); parseDecimal keeps its 0 fallback', () => {
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseDecimal('abc')).toBe(0);
    expect(parseDecimal('٢٫٥')).toBe(2.5);
  });
});

describe('<NumericField> (the one number entry)', () => {
  it('is a text field with a numeric keypad, digits left-to-right, labelled', () => {
    render(<NumericField label="Weight" value={null} onChange={() => undefined} />);
    const input = screen.getByLabelText('Weight');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('dir', 'ltr');
  });

  it('reject mode ignores a keystroke that cannot be part of a number', () => {
    const onChange = vi.fn();
    render(<NumericField ariaLabel="reps" value={null} onChange={onChange} integer />);
    const input = screen.getByLabelText('reps');
    fireEvent.change(input, { target: { value: '١٢' } });
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.change(input, { target: { value: '12.5' } }); // integer field: a dot is not allowed
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('12');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('flag mode keeps unreadable text, marks it invalid and reports null + validity', () => {
    const onChange = vi.fn();
    const onValidity = vi.fn();
    render(<NumericField ariaLabel="waist" value={null} onChange={onChange} invalid="flag" onValidityChange={onValidity} />);
    const input = screen.getByLabelText('waist');
    fireEvent.change(input, { target: { value: '9x' } });
    expect(input).toHaveValue('9x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onValidity).toHaveBeenLastCalledWith(false);
    fireEvent.change(input, { target: { value: '٩٥٫٥' } });
    expect(onChange).toHaveBeenLastCalledWith(95.5);
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it('a stepper nudges by step with buttons and the arrow keys, within min/max', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumericField ariaLabel="kg" stepper value={10} step={2.5} min={0} max={12} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenLastCalledWith(12); // clamped at max
    fireEvent.keyDown(screen.getByLabelText('kg'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(7.5);
    rerender(<NumericField ariaLabel="kg" stepper value={0} step={1} min={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(onChange).toHaveBeenLastCalledWith(0); // clamped at min
  });

  it('keeps "80." while typing and re-syncs from the value when idle', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumericField ariaLabel="w" value={null} onChange={onChange} />);
    const input = screen.getByLabelText('w');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '80.' } });
    expect(input).toHaveValue('80.');
    expect(onChange).toHaveBeenLastCalledWith(80);
    fireEvent.blur(input);
    rerender(<NumericField ariaLabel="w" value={81} onChange={onChange} />);
    expect(input).toHaveValue('81');
  });
});
