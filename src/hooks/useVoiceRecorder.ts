import { useCallback, useEffect, useRef, useState } from 'react';

/** Pick the first MediaRecorder MIME type the browser supports (opus preferred). */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((c) => {
    try {
      return MediaRecorder.isTypeSupported(c);
    } catch {
      return false;
    }
  });
}

function extForMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export type VoiceRecorderState = 'idle' | 'recording';

/**
 * Microphone capture for voice messages via the MediaRecorder API. `start()`
 * requests mic permission and begins recording; `stop()` resolves with the
 * recorded audio `File` (or null if empty/denied); `cancel()` discards it. The
 * mic stream is always torn down on stop/cancel/unmount.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<((f: File | null) => void) | null>(null);

  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!pickMimeType();

  const cleanup = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setState('idle');
    setSeconds(0);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const mime = pickMimeType();
    if (!mime) return false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false; // permission denied / no device
    }
    streamRef.current = stream;
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const file = chunksRef.current.length
        ? new File([new Blob(chunksRef.current, { type: mime })], `voice-${Date.now()}.${extForMime(mime)}`, { type: mime })
        : null;
      resolveRef.current?.(file);
      resolveRef.current = null;
      cleanup();
    };
    recorderRef.current = rec;
    rec.start();
    setState('recording');
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return true;
  }, [cleanup]);

  /** Stop recording and resolve with the recorded File (null if empty). */
  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        cleanup();
        return;
      }
      resolveRef.current = resolve;
      rec.stop();
    });
  }, [cleanup]);

  /** Discard the in-progress recording without producing a file. */
  const cancel = useCallback(() => {
    resolveRef.current = null; // onstop's resolve becomes a no-op → discarded
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else cleanup();
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { supported, state, seconds, start, stop, cancel };
}
