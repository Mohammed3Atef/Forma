import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory localforage (jsdom has no IndexedDB).
const dbs = new Map<string, Map<string, unknown>>();
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!dbs.has(key)) dbs.set(key, new Map());
      return dbs.get(key)!;
    };
    const copy = (v: unknown) => (v instanceof Blob ? v : structuredClone(v));
    return {
      getItem: async (k: string) => (m().has(k) ? copy(m().get(k)) : null),
      setItem: async (k: string, v: unknown) => {
        m().set(k, copy(v));
        return v;
      },
      removeItem: async (k: string) => void m().delete(k),
      clear: async () => m().clear(),
      keys: async () => [...m().keys()],
      iterate: async (fn: (v: unknown, k: string, i: number) => unknown) => {
        let i = 0;
        for (const [k, v] of m()) {
          const r = fn(copy(v), k, i++);
          if (r !== undefined) return r;
        }
      },
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(o.name, o.storeName) } };
});

const upload = vi.fn();
vi.mock('@/lib/image', () => ({ downscaleImage: async (b: Blob) => b }));
vi.mock('@/services/platform/mediaApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/platform/mediaApi')>('@/services/platform/mediaApi');
  return { ...actual, uploadImage: (...a: unknown[]) => upload(...a), uploadFile: (...a: unknown[]) => upload(...a) };
});

import { closeAccountScope, openAccountScope } from '@/data/localScope';
import { __resetOutboxForTests, startOutbox, stopOutbox, useOutbox } from '@/data/outbox/outbox';
import '@/data/outbox/handlers';
import { UploadError } from '@/services/platform/mediaApi';
import { usePhotos } from './photoStore';

let isOnline = true;
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => isOnline });
const file = new Blob(['x'], { type: 'image/jpeg' });

beforeEach(async () => {
  dbs.clear();
  isOnline = true;
  upload.mockReset();
  await stopOutbox();
  closeAccountScope();
  await openAccountScope('client-1');
  await startOutbox('client-1');
  usePhotos.setState({ photos: [], loaded: true });
});
afterEach(async () => {
  await stopOutbox();
});

/** B0 owner rule, now on the durable outbox (B1.6): "uploaded" only after the server acknowledged it. */
describe('progress photo upload honesty', () => {
  it('reports uploaded only after the server returns the URL', async () => {
    upload.mockResolvedValue({ url: 'https://cdn.example/p.jpg', size: 1 });
    await expect(usePhotos.getState().add('front', file)).resolves.toEqual({ uploaded: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(usePhotos.getState().photos[0].cdnUrl).toBe('https://cdn.example/p.jpg');
  });

  it('a failed upload is reported as not uploaded; the photo stays on the device without a URL and stays queued', async () => {
    upload.mockRejectedValue(new UploadError('failed'));
    await expect(usePhotos.getState().add('front', file)).resolves.toEqual({ uploaded: false });
    const [photo] = usePhotos.getState().photos;
    expect(photo).toBeDefined();
    expect(photo.cdnUrl).toBeUndefined();
    expect(useOutbox.getState().ops[0]).toMatchObject({ type: 'progressPhoto.upload', status: 'failed_retryable' });
  });

  it('uploads unavailable (not configured) is not uploaded either, and retries later', async () => {
    upload.mockRejectedValue(new UploadError('notConfigured'));
    await expect(usePhotos.getState().add('side', file)).resolves.toEqual({ uploaded: false });
    expect(usePhotos.getState().photos[0].cdnUrl).toBeUndefined();
    expect(useOutbox.getState().ops[0]).toMatchObject({ status: 'failed_retryable', lastError: { kind: 'unavailable' } });
  });

  it('offline: saved on the device only, then delivered by itself when the connection returns', async () => {
    isOnline = false;
    upload.mockResolvedValue({ url: 'https://cdn.example/later.jpg', size: 1 });
    await expect(usePhotos.getState().add('back', file)).resolves.toEqual({ uploaded: false });
    expect(upload).not.toHaveBeenCalled();
    isOnline = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(usePhotos.getState().photos[0].cdnUrl).toBe('https://cdn.example/later.jpg'), { timeout: 2000 });
    expect(useOutbox.getState().ops[0].status).toBe('acknowledged');
  });
});

afterEach(() => __resetOutboxForTests());
