import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const update = vi.fn();
vi.mock('@/services/trpc', () => ({
  trpc: { coachTargets: { get: { query: (...a: unknown[]) => get(...a) }, update: { mutate: (...a: unknown[]) => update(...a) } } },
}));

import { getClientTargets, isTargetsConflict, updateClientTargets } from './coachTargetsApi';

beforeEach(() => {
  get.mockReset();
  update.mockReset();
});

describe('coach daily targets (B3.5, O-11; owner review B35-R2)', () => {
  it('sends only the changed fields with the values they were edited from — the server compares and sets', async () => {
    update.mockResolvedValue({ _id: 'c1', clientId: 'c1', waterMl: 3000, steps: 9000, cardioMin: 20, updatedBy: 'x', updatedAt: 5 });
    const saved = await updateClientTargets('c1', { steps: 9000, cardioMin: 20 }, { steps: 8000, cardioMin: null });
    expect(update).toHaveBeenCalledWith({ clientId: 'c1', patch: { steps: 9000, cardioMin: 20 }, expected: { steps: 8000, cardioMin: null } });
    expect(saved).toEqual({ waterMl: 3000, steps: 9000, cardioMin: 20, updatedAt: 5 });
  });

  it('recognises the conflict refusal; other errors are not conflicts', () => {
    expect(isTargetsConflict({ data: { code: 'CONFLICT', reason: 'TARGETS_CONFLICT' } })).toBe(true);
    expect(isTargetsConflict(Object.assign(new Error('TARGETS_CONFLICT'), { data: { code: 'CONFLICT' } }))).toBe(true);
    expect(isTargetsConflict({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isTargetsConflict(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('reads only the target numbers', async () => {
    get.mockResolvedValue({ _id: 'c1', clientId: 'c1', steps: 7000, updatedBy: 'coach', updatedAt: 9 });
    expect(await getClientTargets('c1')).toEqual({ steps: 7000, updatedAt: 9 });
  });
});
