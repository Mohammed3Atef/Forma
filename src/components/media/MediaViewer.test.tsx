import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const blobs = new Map<string, string>();
vi.mock('@/data/blobStore', () => ({ blobStore: { objectUrl: async (k: string) => blobs.get(k) ?? null } }));

import { MediaViewer } from './MediaViewer';
import { playVideo, useMediaViewer, viewImages, viewMedia } from '@/stores/mediaViewerStore';
import { mediaRef, resolveMedia } from '@/lib/mediaRef';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => {
  blobs.clear();
  setOnline(true);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => act(() => useMediaViewer.getState().close()));

describe('media reference seam (B1.11)', () => {
  it('resolves what each ref is — before anything loads', () => {
    expect(resolveMedia(mediaRef('https://cdn.example/a.jpg'))).toEqual({ status: 'ready', kind: 'image', src: 'https://cdn.example/a.jpg' });
    expect(resolveMedia(mediaRef('local:checkin:w:front:p1', 'image'))).toEqual({ status: 'not_uploaded', kind: 'image', localKey: 'checkin:w:front:p1' });
    expect(resolveMedia(mediaRef('https://youtu.be/dQw4w9WgXcQ', 'video'))).toMatchObject({ status: 'ready', kind: 'video', video: { kind: 'youtube' } });
    expect(resolveMedia(mediaRef('https://drive.google.com/x', 'video'))).toMatchObject({ status: 'unsupported', reason: 'host' });
    expect(resolveMedia(mediaRef('javascript:alert(1)', 'image'))).toMatchObject({ status: 'unsupported', reason: 'invalid' });
    expect(resolveMedia(mediaRef('http://evil.example/a.png', 'image'))).toMatchObject({ status: 'unsupported' }); // http only on loopback
    expect(mediaRef('https://cdn.example/voice.m4a').kind).toBe('audio');
  });
});

describe('MediaViewer (B1.11)', () => {
  it('an image: loading → ready; a failed load says so with Retry (offline says offline)', async () => {
    render(<MediaViewer />);
    act(() => viewImages(['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'], 1));
    expect(screen.getByTestId('image-viewer')).toBeTruthy();
    expect(screen.getByTestId('media-loading')).toBeTruthy();
    const img = screen.getByRole('dialog').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example/b.jpg');
    fireEvent.load(img);
    expect(screen.getByTestId('media-item').getAttribute('data-state')).toBe('ready');

    act(() => viewImages('https://cdn.example/broken.jpg'));
    fireEvent.error(screen.getByRole('dialog').querySelector('img')!);
    expect(screen.getByTestId('media-failed')).toBeTruthy();
    fireEvent.click(screen.getByTestId('media-retry'));
    expect(screen.getByTestId('media-loading')).toBeTruthy();

    setOnline(false);
    act(() => viewImages('https://cdn.example/far.jpg'));
    fireEvent.error(screen.getByRole('dialog').querySelector('img')!);
    expect(screen.getByTestId('media-offline')).toBeTruthy();
  });

  it('a photo saved on this device but not uploaded shows the local copy and says so; a missing one says that', async () => {
    blobs.set('checkin:w:front:p1', 'blob:local-1');
    render(<MediaViewer />);
    act(() => viewImages('local:checkin:w:front:p1'));
    await waitFor(() => expect(screen.getByTestId('media-not-uploaded')).toBeTruthy());
    expect(screen.getByRole('dialog').querySelector('img')!.getAttribute('src')).toBe('blob:local-1');

    act(() => viewImages('local:gone'));
    await waitFor(() => expect(screen.getByTestId('media-failed')).toBeTruthy());
  });

  it('a link that cannot play is explained, never a dead player; a document offers Open', () => {
    render(<MediaViewer />);
    act(() => playVideo('https://drive.google.com/file/d/x/view'));
    expect(screen.getByTestId('video-popup')).toBeTruthy();
    expect(screen.getByTestId('video-unsupported')).toBeTruthy();

    act(() => viewMedia(mediaRef('https://cdn.example/plan.pdf', 'file', { name: 'plan.pdf' })));
    expect(screen.getByTestId('media-unsupported')).toBeTruthy();
    expect(screen.getByTestId('media-open').getAttribute('href')).toBe('https://cdn.example/plan.pdf');
  });

  it('a YouTube video plays in-app; Esc closes', () => {
    render(<MediaViewer />);
    act(() => playVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    expect(screen.getByTestId('video-youtube')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('video-popup')).toBeNull();
  });
});
