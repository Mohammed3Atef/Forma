import { describe, expect, it } from 'vitest';
import { pickFreshDraft } from './draft';

describe('pickFreshDraft (K-16)', () => {
  it('keeps a draft taken from the current server copy', () => {
    expect(pickFreshDraft({ updatedAt: 100, v: 'draft' }, { updatedAt: 100, v: 'server' })?.v).toBe('draft');
    expect(pickFreshDraft({ updatedAt: 150, v: 'draft' }, { updatedAt: 100, v: 'server' })?.v).toBe('draft');
  });
  it('drops a draft when the server copy changed after it', () => {
    expect(pickFreshDraft({ updatedAt: 100, v: 'draft' }, { updatedAt: 200, v: 'server' })).toBeNull();
  });
  it('no draft, or no timestamps to compare → keep behaviour', () => {
    expect(pickFreshDraft(null, { updatedAt: 1 })).toBeNull();
    expect(pickFreshDraft({ v: 1 } as { v: number; updatedAt?: number }, null)).toEqual({ v: 1 });
  });
});
