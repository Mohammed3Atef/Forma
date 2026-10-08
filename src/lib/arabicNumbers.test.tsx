import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dateLocale, normalizeNumericText, parseDecimalOrNull, shortDate, weekdayInitials } from './utils';
import { NumberStepper } from '@/components/NumberStepper';
import { MeasurementForm } from '@/components/MeasurementForm';
import { ExerciseCard } from '@/components/ExerciseCard';
import type { Exercise, ExerciseLog } from '@/types';

describe('Arabic number entry (RTL-04)', () => {
  it('normalises Arabic-Indic / Persian digits and Arabic separators', () => {
    expect(normalizeNumericText('٨٠٫٥')).toBe('80.5');
    expect(normalizeNumericText('۹۰,۲۵')).toBe('90.25');
    expect(normalizeNumericText('‏١٢٠‎')).toBe('120');
    expect(parseDecimalOrNull('١٠٠')).toBe(100);
    expect(parseDecimalOrNull('')).toBeNull();
    expect(parseDecimalOrNull('abc')).toBeNull(); // never a silent 0
  });

  it('check-in weight stepper accepts "٨٠٫٥" (and "80." mid-typing)', () => {
    const onChange = vi.fn();
    render(<NumberStepper value={null} onChange={onChange} ariaLabel="weight" />);
    const input = screen.getByLabelText('weight');
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.change(input, { target: { value: '80.' } });
    expect(onChange).toHaveBeenLastCalledWith(80);
    fireEvent.change(input, { target: { value: '٨٠٫٥' } });
    expect(onChange).toHaveBeenLastCalledWith(80.5);
  });

  it('set weight / reps cells accept Arabic digits', () => {
    const onUpdateSet = vi.fn();
    const ex = { id: 'b', name: 'Bench', targetMuscle: 'chest', workingSets: 1, repRange: '8', restSec: 60, notes: { en: '', ar: '' } } as unknown as Exercise;
    const log: ExerciseLog = { exerciseId: 'b', done: false, sets: [{ setIndex: 0, type: 'working', targetReps: '8', actualReps: null, weightKg: null, rpe: null, done: false }] };
    render(<ExerciseCard exercise={ex} log={log} prev={null} onUpdateSet={onUpdateSet} onToggleDone={() => undefined} onAddSet={() => undefined} onRemoveSet={() => undefined} />);
    fireEvent.change(screen.getByTestId('set-reps-0'), { target: { value: '١٢' } });
    expect(onUpdateSet).toHaveBeenLastCalledWith(0, { actualReps: 12 });
  });

  it('measurements save Arabic digits and flag (never drop) an unreadable value', async () => {
    const onSave = vi.fn();
    const { container } = render(<MeasurementForm date="2026-10-05" onSave={onSave} />);
    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: '٩٥٫٥' } });
    fireEvent.change(inputs[1], { target: { value: '9x' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(inputs[1], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(Object.values(onSave.mock.calls[0][1] as Record<string, number>)).toContain(95.5);
  });
});

describe('Egyptian Arabic dates (RTL-02)', () => {
  it('both Arabic locales get Arabic date formats', () => {
    expect(dateLocale('ar-eg')).toBe('ar-EG');
    expect(dateLocale('ar')).toBe('ar-EG');
    expect(dateLocale('en')).toBe('en-GB');
    expect(shortDate('2026-10-04', 'ar-eg')).not.toMatch(/Oct|Sun/);
  });
  it('weekday initials are localized, not hard-coded English letters', () => {
    expect(weekdayInitials('en')).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F']);
    expect(weekdayInitials('ar-eg').join('')).not.toMatch(/[A-Z]/);
  });
});
