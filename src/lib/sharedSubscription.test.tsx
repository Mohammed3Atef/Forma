import { describe, expect, it, vi } from 'vitest';
import { activeSharedSubscriptions, shareSubscription } from './sharedSubscription';

describe('shared pollers (RM-82)', () => {
  it('two subscribers share ONE underlying poll; a late one gets the last value; the last unsubscribe stops it', () => {
    const stop = vi.fn();
    let emit!: (v: number) => void;
    const start = vi.fn((e: (v: number) => void) => {
      emit = e;
      return stop;
    });
    const a = vi.fn();
    const b = vi.fn();
    const offA = shareSubscription('k', start, a);
    emit(3);
    const offB = shareSubscription('k', start, b);
    expect(start).toHaveBeenCalledTimes(1); // the second bell does not start a second loop
    expect(b).toHaveBeenCalledWith(3); // replayed immediately
    emit(5);
    expect(a).toHaveBeenLastCalledWith(5);
    expect(b).toHaveBeenLastCalledWith(5);
    offA();
    expect(stop).not.toHaveBeenCalled();
    offB();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(activeSharedSubscriptions()).toBe(0);
  });
});
