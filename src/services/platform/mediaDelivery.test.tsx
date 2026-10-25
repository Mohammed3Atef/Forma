import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * MD-02 (B4.3) — the client side of signed personal media: while the server does not sign (the
 * default), every URL is used as stored, immediately; when it does, personal media is swapped for
 * its signed URL (one batched request), media this viewer may not see becomes `null`, and anything
 * that is not personal media (library content, YouTube, a local blob) is never sent.
 */
const h = vi.hoisted(() => ({ signed: false, sign: vi.fn() }));
vi.mock('@/services/trpc', () => ({
  trpc: {
    media: {
      status: { query: async () => ({ configured: true, signedDelivery: h.signed }) },
      sign: { mutate: (input: { urls: string[] }) => h.sign(input) },
    },
  },
}));

import { __resetMediaDeliveryForTests, looksPersonal, useMediaSrc } from './mediaDelivery';

const CDN = 'https://cdn.forma.test';
const progress = `${CDN}/Forma/client-1/p1.jpg`;
const attachment = `${CDN}/Forma/client-1/messages/m1.jpg`;
const library = `${CDN}/Forma/coach-a/exercises/demo.mp4`;

beforeEach(() => {
  __resetMediaDeliveryForTests();
  h.signed = false;
  h.sign.mockReset().mockImplementation(async ({ urls }: { urls: string[] }) => ({ enabled: true, signed: Object.fromEntries(urls.filter((u) => u !== attachment).map((u) => [u, { url: `${u}?token=t&expires=${Math.floor(Date.now() / 1000) + 3600}`, expires: Math.floor(Date.now() / 1000) + 3600 }])) }));
});

describe('signed personal media on the client', () => {
  it('tells personal media from everything else', () => {
    expect(looksPersonal(progress)).toBe(true);
    expect(looksPersonal(`${CDN}/Forma/u1/avatar/a.webp`)).toBe(true);
    expect(looksPersonal(attachment)).toBe(true);
    expect(looksPersonal(library)).toBe(false);
    expect(looksPersonal('blob:https://app/1')).toBe(false);
    expect(looksPersonal('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(looksPersonal(null)).toBe(false);
  });

  it('off (the default): the stored URL right away — no signing request', async () => {
    const { result } = renderHook(() => useMediaSrc(progress));
    expect(result.current).toBe(progress);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toBe(progress);
    expect(h.sign).not.toHaveBeenCalled();
  });

  it('on: personal media is signed in one batch; media this viewer may not see is null; library content is never sent', async () => {
    h.signed = true;
    const a = renderHook(() => useMediaSrc(progress));
    const b = renderHook(() => useMediaSrc(attachment));
    const c = renderHook(() => useMediaSrc(library));
    await waitFor(() => expect(a.result.current).toMatch(/\?token=t&expires=\d+$/));
    await waitFor(() => expect(b.result.current).toBeNull());
    expect(c.result.current).toBe(library);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.sign.mock.calls[0][0].urls.sort()).toEqual([attachment, progress].sort());
    // Cached: a second viewer of the same photo asks nothing more.
    const d = renderHook(() => useMediaSrc(progress));
    await waitFor(() => expect(d.result.current).toMatch(/\?token=t/));
    expect(h.sign).toHaveBeenCalledTimes(1);
  });
});
