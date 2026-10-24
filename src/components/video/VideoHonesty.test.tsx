import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { classifyVideoUrl, isPlayableVideoUrl, safeExternalUrl } from '@/lib/videoSource';
import { VideoFilePlayer, VideoSourcePlayer, VIDEO_STALL_MS } from './VideoPlayer';
import { ExerciseCard } from '@/components/ExerciseCard';
import { ExerciseForm } from '@/components/workout/ExerciseForm';
import type { Exercise, ExerciseLog } from '@/types';

vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false, uploadFile: vi.fn(), UploadError: class extends Error {} }));

afterEach(() => vi.useRealTimers());

describe('video links (CL-20 / MD-09)', () => {
  it('classifies what can actually play', () => {
    expect(classifyVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ kind: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    expect(classifyVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ kind: 'youtube' });
    expect(classifyVideoUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({ kind: 'youtube' });
    expect(classifyVideoUrl('https://forma.b-cdn.net/coach/ex/abc.mp4')).toMatchObject({ kind: 'file', maybeHevc: false });
    expect(classifyVideoUrl('https://forma.b-cdn.net/coach/ex/IMG_0001.MOV')).toMatchObject({ kind: 'file', maybeHevc: true });
    for (const u of ['https://drive.google.com/file/d/xyz/view', 'https://vimeo.com/123', 'https://www.instagram.com/reel/abc/', 'https://example.com/page']) {
      expect(classifyVideoUrl(u)).toMatchObject({ kind: 'unsupported', reason: 'host' });
    }
    for (const u of ['javascript:alert(1)', 'http://x.com/a.mp4', 'http://127.0.0.1.evil.com/a.mp4', 'not a url']) expect(classifyVideoUrl(u)).toMatchObject({ kind: 'unsupported', reason: 'invalid' });
    // Plain http only on loopback (local dev / the isolated test CDN).
    expect(classifyVideoUrl('http://127.0.0.1:5287/cdn/Forma/c/exercises/a.mp4')).toMatchObject({ kind: 'file' });
    expect(classifyVideoUrl('')).toBeNull();
    expect(isPlayableVideoUrl('https://www.youtube.com/watch?v=abc')).toBe(false); // not a real id
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('video player states', () => {
  it('shows loading (not a dead 0:00 player) until the first frame', () => {
    render(<VideoFilePlayer url="https://cdn.test/a.mp4" />);
    expect(screen.getByTestId('video-loading')).toBeInTheDocument();
    fireEvent(screen.getByTestId('video-element'), new Event('loadeddata'));
    expect(screen.queryByTestId('video-loading')).toBeNull();
  });

  it('an unsupported HEVC file says so honestly, with Retry and Open video', () => {
    render(<VideoFilePlayer url="https://cdn.test/IMG_1.MOV" maybeHevc />);
    const el = screen.getByTestId('video-element') as HTMLVideoElement;
    Object.defineProperty(el, 'error', { value: { code: 4 } });
    fireEvent.error(el);
    expect(screen.getByTestId('video-failed')).toHaveTextContent(/HEVC/);
    expect(screen.getByTestId('video-open-source')).toHaveAttribute('href', 'https://cdn.test/IMG_1.MOV');
    fireEvent.click(screen.getByTestId('video-retry'));
    expect(screen.getByTestId('video-loading')).toBeInTheDocument();
  });

  it('a stalled video becomes a failed state instead of spinning forever', () => {
    vi.useFakeTimers();
    render(<VideoFilePlayer url="https://cdn.test/a.mp4" />);
    act(() => vi.advanceTimersByTime(VIDEO_STALL_MS + 10));
    expect(screen.getByTestId('video-failed')).toBeInTheDocument();
  });

  it('a Drive / Vimeo link is explained, never shown as a player', () => {
    render(<VideoSourcePlayer url="https://drive.google.com/file/d/xyz/view" title="Bench" />);
    expect(screen.getByTestId('video-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('video-element')).toBeNull();
  });
});

describe('no video button without a video (CL-20)', () => {
  const ex = { id: 'bench', name: 'Bench', targetMuscle: 'chest', workingSets: 1, repRange: '8', restSec: 90, notes: { en: '', ar: '' } } as unknown as Exercise;
  const log: ExerciseLog = { exerciseId: 'bench', done: false, sets: [{ setIndex: 0, type: 'working', targetReps: '8', actualReps: null, weightKg: null, rpe: null, done: false }] };
  const noop = () => undefined;
  it('hides the video and ⓘ buttons when nothing is behind them', () => {
    render(<ExerciseCard exercise={ex} log={log} prev={null} onUpdateSet={noop} onToggleDone={noop} onAddSet={noop} onRemoveSet={noop} />);
    expect(screen.queryByTestId('exercise-video-button')).toBeNull();
    expect(screen.queryByLabelText(/notes/i)).toBeNull();
  });
  it('shows the video button when there is a playable video', () => {
    render(<ExerciseCard exercise={ex} log={log} prev={null} onUpdateSet={noop} onToggleDone={noop} onAddSet={noop} onRemoveSet={noop} onVideo={noop} />);
    expect(screen.getByTestId('exercise-video-button')).toBeInTheDocument();
  });
});

describe('coach video link validation', () => {
  it('a Drive link blocks saving with an explanation; YouTube is accepted', () => {
    const onSave = vi.fn();
    render(<ExerciseForm initial={{ id: 'e', name: 'Bench', targetMuscle: 'chest', warmupSets: '0', workingSets: 3, repRange: '8-12', rir: '', tempo: '', restSec: 90, videoId: null, notes: { en: '', ar: '' } } as unknown as Exercise} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('ex-video'), { target: { value: 'https://drive.google.com/file/d/xyz/view' } });
    expect(screen.getByTestId('ex-video-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('ex-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('ex-video'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    expect(screen.queryByTestId('ex-video-invalid')).toBeNull();
    fireEvent.click(screen.getByTestId('ex-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }));
  });
});
