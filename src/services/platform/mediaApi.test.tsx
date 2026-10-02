import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Wiring tests for the browser side of the media proxy: which endpoint gets
 * which bytes, how progress is aggregated across chunks, how HTTP failures map
 * onto the i18n `upload.*` codes, abort, and the one refresh-and-retry on 401.
 * Transport is faked at the XHR / fetch boundary — nothing here reaches a
 * network or a real Bunny zone.
 */

const refreshSession = vi.fn<() => Promise<boolean>>();
const getAccessToken = vi.fn<() => string | null>(() => 'tok-1');
const statusQuery = vi.fn<() => Promise<{ configured: boolean }>>();

vi.mock('@/services/platformApi', () => ({
  getAccessToken: () => getAccessToken(),
  refreshSession: () => refreshSession(),
  setAccessToken: () => undefined,
}));
vi.mock('@/services/trpc', () => ({
  trpc: { media: { status: { query: () => statusQuery() }, listImages: { query: vi.fn() } } },
}));

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Blob;
}

/** Scripted responses per request index; default 200 + JSON. */
let script: { status: number; json?: unknown }[] = [];
let sent: Sent[] = [];
let fetchCalls: { url: string; body: unknown }[] = [];

class FakeXHR {
  static instances: FakeXHR[] = [];
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  withCredentials = false;
  private url = '';
  private headers: Record<string, string> = {};
  private aborted = false;
  open(_m: string, url: string) {
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  send(body: Blob) {
    FakeXHR.instances.push(this);
    sent.push({ url: this.url, headers: this.headers, body });
    const step = script.shift() ?? { status: 200, json: { url: 'https://cdn/x', size: body.size, kind: 'image', name: 'x', mimeType: body.type } };
    // Deliver progress then completion asynchronously, like a real upload.
    setTimeout(() => {
      if (this.aborted) return;
      this.upload.onprogress?.({ lengthComputable: true, loaded: Math.floor(body.size / 2), total: body.size });
      this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
      this.status = step.status;
      this.responseText = step.json === undefined ? '' : JSON.stringify(step.json);
      this.onload?.();
    }, 0);
  }
}

beforeEach(() => {
  script = [];
  sent = [];
  fetchCalls = [];
  FakeXHR.instances = [];
  refreshSession.mockReset();
  getAccessToken.mockClear();
  statusQuery.mockReset();
  vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      fetchCalls.push({ url, body });
      const step = script.shift() ?? { status: 200, json: {} };
      return new Response(JSON.stringify(step.json ?? {}), { status: step.status, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MB = 1024 * 1024;
function blob(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

async function api() {
  return import('./mediaApi');
}

describe('mediaApi — single-shot uploads', () => {
  it('posts the bytes ONCE to /api/media/upload with the category (never a storage path) and the bearer token', async () => {
    const { uploadImage } = await api();
    const file = blob(10 * 1024, 'image/webp');
    script = [{ status: 200, json: { url: 'https://cdn.example.com/Forma/u1/avatar/abc.webp', size: file.size, kind: 'image', name: 'abc.webp', mimeType: 'image/webp' } }];
    const res = await uploadImage(file, { category: 'avatar' });
    expect(res).toEqual({ url: 'https://cdn.example.com/Forma/u1/avatar/abc.webp', size: file.size });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('/api/media/upload?category=avatar');
    expect(sent[0].headers.Authorization).toBe('Bearer tok-1');
    expect(sent[0].headers['Content-Type']).toBe('image/webp');
    expect(fetchCalls).toHaveLength(0);
  });

  it('carries the ids a category needs (checkInId / clientId) and the display name', async () => {
    const { uploadImage, uploadFile } = await api();
    await uploadImage(blob(100, 'image/png'), { category: 'checkin', checkInId: 'ci_1' });
    expect(sent[0].url).toBe('/api/media/upload?category=checkin&checkInId=ci_1');
    const f = new File([new Uint8Array(100)], 'notes.pdf', { type: 'application/pdf' });
    await uploadFile(f, { category: 'message', clientId: 'client-9' });
    expect(sent[1].url).toBe('/api/media/upload?category=message&clientId=client-9&name=notes.pdf');
  });

  it('reports progress and resolves the kind/name the server returned', async () => {
    const { uploadFile } = await api();
    const pcts: number[] = [];
    script = [{ status: 200, json: { url: 'u', size: 5, kind: 'audio', name: 'voice.weba', mimeType: 'audio/webm' } }];
    const r = await uploadFile(blob(10, 'audio/webm'), { category: 'message', clientId: 'c' }, { onProgress: (p) => pcts.push(p), name: 'voice.weba' });
    expect(r.kind).toBe('audio');
    expect(pcts).toEqual([50, 100]);
  });

  it('maps server refusals onto the i18n codes the pickers show', async () => {
    const { uploadFile, uploadImage, UploadError } = await api();
    const cases: [number, unknown, string][] = [
      [413, { error: 'tooLargeVideo' }, 'tooLargeVideo'],
      [413, { error: 'tooLarge' }, 'tooLarge'],
      [415, { error: 'badType' }, 'badType'],
      [503, { error: 'notConfigured' }, 'notConfigured'],
      [403, { error: 'forbidden', message: 'Not a participant in this thread' }, 'failed'],
      [500, undefined, 'failed'],
    ];
    for (const [status, json, code] of cases) {
      script = [{ status, json }];
      const err = await uploadFile(blob(5, 'video/mp4'), { category: 'exercise' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UploadError);
      expect((err as InstanceType<typeof UploadError>).code).toBe(code);
    }
    // Client-side pre-checks (instant feedback; the server enforces the same limits).
    await expect(uploadImage(blob(5, 'application/pdf'), { category: 'avatar' })).rejects.toMatchObject({ code: 'badType' });
    await expect(uploadImage(blob(5 * MB + 1, 'image/png'), { category: 'progress' })).rejects.toMatchObject({ code: 'tooLarge' });
    await expect(uploadFile(blob(50 * MB + 1, 'video/mp4'), { category: 'exercise' })).rejects.toMatchObject({ code: 'tooLargeVideo' });
    await expect(uploadFile(blob(10 * MB + 1, 'audio/webm'), { category: 'message', clientId: 'c' })).rejects.toMatchObject({ code: 'tooLargeAudio' });
    await expect(uploadFile(blob(25 * MB + 1, 'application/pdf'), { category: 'message', clientId: 'c' })).rejects.toMatchObject({ code: 'tooLargeFile' });
  });

  it('refreshes the session exactly once on 401 and retries with the new token', async () => {
    const { uploadImage } = await api();
    script = [{ status: 401, json: { error: 'unauthorized' } }, { status: 200, json: { url: 'ok', size: 1, kind: 'image', name: 'a', mimeType: 'image/png' } }];
    refreshSession.mockResolvedValueOnce(true);
    getAccessToken.mockReturnValueOnce('tok-old').mockReturnValueOnce('tok-new');
    const r = await uploadImage(blob(1, 'image/png'), { category: 'avatar' });
    expect(r.url).toBe('ok');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sent.map((s) => s.headers.Authorization)).toEqual(['Bearer tok-old', 'Bearer tok-new']);

    // A second 401 after a refresh is a real failure, not a loop.
    script = [{ status: 401 }, { status: 401 }];
    refreshSession.mockResolvedValueOnce(true);
    await expect(uploadImage(blob(1, 'image/png'), { category: 'avatar' })).rejects.toMatchObject({ code: 'failed' });
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('abort rejects with `cancelled` (already-aborted signal never sends)', async () => {
    const { uploadImage } = await api();
    const ac = new AbortController();
    ac.abort();
    await expect(uploadImage(blob(1, 'image/png'), { category: 'avatar' }, { signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(sent).toHaveLength(0);
    const ac2 = new AbortController();
    const p = uploadImage(blob(1, 'image/png'), { category: 'avatar' }, { signal: ac2.signal });
    ac2.abort();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('mediaApi — chunked uploads (> 4 MiB)', () => {
  it('init → N chunks → finalize, with byte-accurate aggregated progress', async () => {
    const { uploadFile } = await api();
    const size = 2 * 4 * MB + 12_345;
    const file = new File([new Uint8Array(size)], 'demo.mp4', { type: 'video/mp4' });
    script = [
      { status: 200, json: { uploadId: 'u-1', chunkSize: 4 * MB, totalChunks: 3 } }, // init (fetch)
      { status: 200, json: { received: 1 } },
      { status: 200, json: { received: 2 } },
      { status: 200, json: { received: 3 } },
      { status: 200, json: { url: 'https://cdn/Forma/coach/exercises/demo.mp4', size, kind: 'video', name: 'demo.mp4', mimeType: 'video/mp4' } }, // finalize (fetch)
    ];
    const pcts: number[] = [];
    const r = await uploadFile(file, { category: 'exercise' }, { onProgress: (p) => pcts.push(p) });
    expect(r.size).toBe(size);
    expect(fetchCalls.map((c) => c.url)).toEqual(['/api/media/init', '/api/media/finalize']);
    expect(fetchCalls[0].body).toEqual({ category: 'exercise', mimeType: 'video/mp4', size, name: 'demo.mp4' });
    expect(fetchCalls[1].body).toEqual({ uploadId: 'u-1' });
    expect(sent.map((s) => s.url)).toEqual(['/api/media/chunk?uploadId=u-1&index=0', '/api/media/chunk?uploadId=u-1&index=1', '/api/media/chunk?uploadId=u-1&index=2']);
    expect(sent.map((s) => s.body.size)).toEqual([4 * MB, 4 * MB, 12_345]);
    // Monotonic, ends at 100, never resets to 0 between chunks.
    expect(pcts[pcts.length - 1]).toBe(100);
    for (let i = 1; i < pcts.length; i += 1) expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1]);
    // Chunk 0 alone is ~50 % of an 8 MiB + 12 KB file: half-way through it ≈ 25 %, done ≈ 50 %.
    expect(pcts[0]).toBe(25);
    expect(pcts[1]).toBe(50);
    expect(pcts.filter((p) => p === 0)).toHaveLength(0);
  });

  it('a refused init never sends a chunk; a refused chunk stops the upload', async () => {
    const { uploadFile } = await api();
    const file = new File([new Uint8Array(5 * MB)], 'big.mp4', { type: 'video/mp4' });
    script = [{ status: 403, json: { error: 'forbidden' } }];
    await expect(uploadFile(file, { category: 'exercise' })).rejects.toMatchObject({ code: 'failed' });
    expect(sent).toHaveLength(0);

    script = [{ status: 200, json: { uploadId: 'u-2', chunkSize: 4 * MB, totalChunks: 2 } }, { status: 410, json: { error: 'expired' } }];
    await expect(uploadFile(file, { category: 'exercise' })).rejects.toMatchObject({ code: 'failed' });
    expect(sent).toHaveLength(1);
    expect(fetchCalls.map((c) => c.url)).toEqual(['/api/media/init', '/api/media/init']); // no finalize
  });
});

describe('useUploadConfigured', () => {
  it('starts false, flips to what the server says, and does not re-ask once known', async () => {
    const { useUploadConfigured } = await api();
    statusQuery.mockResolvedValue({ configured: true });
    const { result, rerender } = renderHook(() => useUploadConfigured());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    rerender();
    renderHook(() => useUploadConfigured());
    expect(statusQuery).toHaveBeenCalledTimes(1);
  });
});
