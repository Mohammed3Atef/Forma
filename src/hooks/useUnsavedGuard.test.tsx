import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const answer = vi.fn<() => Promise<boolean>>();
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: () => answer() }));

import { useUnsavedGuard } from './useUnsavedGuard';
import { confirmLeave, hasNavGuard } from '@/stores/navGuardStore';

function Editor({ dirty, onLeave }: { dirty: boolean; onLeave: () => void }) {
  useUnsavedGuard(dirty, undefined, onLeave);
  return null;
}

beforeEach(() => answer.mockReset());

/** NAV-K02: "Leave" on the unsaved-changes prompt discards the autosaved draft; "Cancel" keeps it. */
describe('useUnsavedGuard', () => {
  it('Leave runs the discard callback', async () => {
    const onLeave = vi.fn();
    render(<Editor dirty onLeave={onLeave} />);
    expect(hasNavGuard()).toBe(true);
    answer.mockResolvedValue(true);
    await expect(confirmLeave()).resolves.toBe(true);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('Cancel keeps the draft', async () => {
    const onLeave = vi.fn();
    render(<Editor dirty onLeave={onLeave} />);
    answer.mockResolvedValue(false);
    await expect(confirmLeave()).resolves.toBe(false);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
