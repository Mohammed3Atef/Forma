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
/** Differentiated failure reasons — lets the caller show a specific message instead of one generic "microphone unavailable" string. */
export type VoiceRecorderError = 'insecure' | 'denied' | 'notfound' | 'busy' | 'unsupported' | 'failed';

/** Hard cap so a forgotten recording can't grow unbounded — matches the 10MB/audio upload limit at a realistic bitrate. */
const MAX_SECONDS = 300; // 5 minutes

function classifyGetUserMediaError(e: unknown): VoiceRecorderError {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'notfound';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'failed';
}

/**
 * Microphone capture for voice messages via the MediaRecorder API. `start()`
 * requests mic permission and begins recording; `stop()` resolves with the
 * recorded audio `File` (or null if empty/denied); `cancel()` discards it. The
 * mic stream is always torn down on stop/cancel/unmount. Auto-stops at
 * `MAX_SECONDS` and hands the file to `onAutoStop` (nobody's awaiting `stop()`
 * at that point since the user didn't tap anything).
 */
export function useVoiceRecorder(opts?: { onAutoStop?: (file: File | null) => void }) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [lastError, setLastError] = useState<VoiceRecorderError | null>(null);
  // 0–1 live input amplitude while recording — a lightweight level meter, not
  // a full waveform history (no need to keep every sample around).
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<((f: File | null) => void) | null>(null);
  const onAutoStopRef = useRef(opts?.onAutoStop);
  onAutoStopRef.current = opts?.onAutoStop;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);

  const insecure = typeof window !== 'undefined' && typeof window.isSecureContext === 'boolean' && !window.isSecureContext;
  const supported =
    !insecure && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!pickMimeType();

  const cleanup = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (levelRafRef.current != null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
    setState('idle');
    setSeconds(0);
    setLevel(0);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setLastError(null);
    if (insecure) {
      setLastError('insecure');
      return false;
    }
    const mime = pickMimeType();
    if (!mime) {
      setLastError('unsupported');
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setLastError(classifyGetUserMediaError(e));
      return false;
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
      if (resolveRef.current) {
        resolveRef.current(file);
        resolveRef.current = null;
      } else {
        // Nobody's awaiting `stop()` — this is the auto-stop-at-cap path.
        onAutoStopRef.current?.(file);
      }
      cleanup();
    };
    recorderRef.current = rec;
    rec.start();
    setState('recording');
    setSeconds(0);

    // Live level meter: a small AnalyserNode sampled via rAF, not a stored
    // waveform — cheap, and thrown away with the AudioContext on cleanup.
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const sample = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sumSq += v * v;
          }
          setLevel(Math.min(1, Math.sqrt(sumSq / data.length) * 4));
          levelRafRef.current = requestAnimationFrame(sample);
        };
        levelRafRef.current = requestAnimationFrame(sample);
      }
    } catch {
      // Level meter is cosmetic — recording still works without it.
    }

    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) {
          const activeRec = recorderRef.current;
          if (activeRec && activeRec.state !== 'inactive') activeRec.stop();
        }
        return next;
      });
    }, 1000);
    return true;
  }, [cleanup, insecure]);

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

  return { supported, state, seconds, level, lastError, maxSeconds: MAX_SECONDS, start, stop, cancel };
}
