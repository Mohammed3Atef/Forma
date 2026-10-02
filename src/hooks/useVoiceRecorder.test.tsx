import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRecorder } from './useVoiceRecorder';

/** M-1: "Cancel recording" used to fall into the auto-stop branch and produce a draft anyway. */

class FakeRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    configurable: true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useVoiceRecorder', () => {
  it('cancel() discards the recording — no file, no onAutoStop draft', async () => {
    const onAutoStop = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onAutoStop }));
    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
    expect(result.current.state).toBe('recording');
    act(() => result.current.cancel());
    expect(onAutoStop).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('stop() still resolves with the recorded file', async () => {
    const onAutoStop = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onAutoStop }));
    await act(async () => {
      await result.current.start();
    });
    let file: File | null = null;
    await act(async () => {
      file = await result.current.stop();
    });
    expect(file).toBeInstanceOf(File);
    expect(onAutoStop).not.toHaveBeenCalled();
  });

  it('a cancel does not poison the next recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.cancel());
    await act(async () => {
      await result.current.start();
    });
    let file: File | null = null;
    await act(async () => {
      file = await result.current.stop();
    });
    expect(file).toBeInstanceOf(File);
  });
});
