import { describe, expect, it } from 'vitest';
import { normalizeAssessment } from './assessment';
import type { ClientAssessment } from '@/types';

/** Phase-3 E-B-1 / E-D-8: views crashed on `a.health.*` for records missing whole sections. */
describe('normalizeAssessment', () => {
  it('fills every missing section of a legacy/partial record', () => {
    const a = normalizeAssessment({ status: 'submitted', completed: true, basic: { fullName: 'Aya' } } as unknown as ClientAssessment);
    expect(a.basic.fullName).toBe('Aya');
    expect(a.health.injuries).toEqual([]);
    expect(a.health.noInjuries).toBe(true); // missing data never raises a false injury flag
    expect(a.health.hasMedicalConditions).toBe(false);
    expect(a.nutrition.allergies).toEqual([]);
    expect(a.lifestyle.sleepHours).toBeGreaterThan(0);
    expect(a.motivation.commitmentLevel).toBeGreaterThan(0);
    expect(a.progressPhotos).toEqual({});
    expect((a as unknown as { status: string }).status).toBe('submitted');
  });

  it('keeps every value that IS present', () => {
    const a = normalizeAssessment({ health: { injuries: ['knee'], noInjuries: false, hasMedicalConditions: true, medicalDetails: 'asthma' } } as unknown as ClientAssessment);
    expect(a.health).toMatchObject({ injuries: ['knee'], noInjuries: false, hasMedicalConditions: true, medicalDetails: 'asthma' });
  });

  it('passes null through', () => {
    expect(normalizeAssessment(null)).toBeNull();
  });
});
