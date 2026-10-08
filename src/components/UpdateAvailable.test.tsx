import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const confirmDialog = vi.fn();
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: (...a: unknown[]) => confirmDialog(...a) }));

import { UpdateAvailable } from './UpdateAvailable';
import { applyUpdateAtSafePoint, useUpdate } from '@/stores/updateStore';
import { useTimer } from '@/stores/timerStore';
import { useCardio } from '@/stores/cardioStore';

const setVisibility = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });

beforeEach(() => {
  confirmDialog.mockReset();
  useUpdate.setState({ ready: false, apply: null });
  useTimer.setState({ running: false, paused: false, endsAt: null, intervalId: null, pausedRemaining: null, remainingSec: 0 });
  useCardio.setState({ liveStart: null, liveParams: null });
  setVisibility('visible');
});

describe('update available (B0.7)', () => {
  it('shows nothing until an update is ready, then a pill that applies it', () => {
    const apply = vi.fn();
    const { rerender } = render(<UpdateAvailable />);
    expect(screen.queryByTestId('update-available')).toBeNull();
    useUpdate.getState().setReady(apply);
    rerender(<UpdateAvailable />);
    fireEvent.click(screen.getByTestId('update-available'));
    return waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  });

  it('during a rest timer / live cardio the tap asks first; "Later" does not reload', async () => {
    const apply = vi.fn();
    useUpdate.getState().setReady(apply);
    useCardio.setState({ liveStart: Date.now() });
    confirmDialog.mockResolvedValue(false);
    render(<UpdateAvailable />);
    fireEvent.click(screen.getByTestId('update-available'));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(apply).not.toHaveBeenCalled();
  });

  it('auto-applies only at a safe point: hidden AND no critical work', () => {
    const apply = vi.fn();
    useUpdate.getState().setReady(apply);
    expect(applyUpdateAtSafePoint()).toBe(false); // visible → never reloads under the user
    setVisibility('hidden');
    useTimer.setState({ running: true });
    expect(applyUpdateAtSafePoint()).toBe(false); // rest timer running
    useTimer.setState({ running: false });
    expect(applyUpdateAtSafePoint()).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
