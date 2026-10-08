import { beforeEach, describe, expect, it, vi } from 'vitest';

const puts: unknown[] = [];
const upload = vi.fn();
const configured = vi.fn();

vi.mock('@/data/dataSource', () => ({
  getDataSource: () => ({ progressPhotos: { put: async (p: unknown) => void puts.push(p), getAll: async () => [] } }),
}));
vi.mock('@/data/blobStore', () => ({ blobStore: { put: async () => {}, get: async () => null, remove: async () => {}, objectUrl: async () => null } }));
vi.mock('@/data/sync/tombstones', () => ({ recordDeletion: async () => {} }));
vi.mock('@/lib/image', () => ({ downscaleImage: async (b: Blob) => b }));
vi.mock('@/services/platform/mediaApi', () => ({ ensureUploadConfig: () => configured(), uploadImage: (...a: unknown[]) => upload(...a) }));
vi.mock('@/services/auth/sessionStore', () => ({ useSession: { getState: () => ({ uid: 'client-1' }) } }));

import { usePhotos } from './photoStore';

const file = new Blob(['x'], { type: 'image/jpeg' });

beforeEach(() => {
  puts.length = 0;
  upload.mockReset();
  configured.mockReset().mockResolvedValue(true);
  usePhotos.setState({ photos: [], loaded: true });
});

/** B0 owner rule: never claim an upload succeeded unless the server acknowledged it. */
describe('progress photo upload honesty', () => {
  it('reports uploaded only after the server returns the URL', async () => {
    upload.mockResolvedValue({ url: 'https://cdn.example/p.jpg' });
    await expect(usePhotos.getState().add('front', file)).resolves.toEqual({ uploaded: true });
    expect(usePhotos.getState().photos[0].cdnUrl).toBe('https://cdn.example/p.jpg');
  });

  it('a failed upload is reported as not uploaded and the photo is kept locally without a URL', async () => {
    upload.mockRejectedValue(new Error('401'));
    await expect(usePhotos.getState().add('front', file)).resolves.toEqual({ uploaded: false });
    const [photo] = usePhotos.getState().photos;
    expect(photo).toBeDefined();
    expect(photo.cdnUrl).toBeUndefined();
  });

  it('uploads unavailable (no config) is not uploaded either', async () => {
    configured.mockResolvedValue(false);
    await expect(usePhotos.getState().add('side', file)).resolves.toEqual({ uploaded: false });
    expect(upload).not.toHaveBeenCalled();
    expect(usePhotos.getState().photos[0].cdnUrl).toBeUndefined();
  });
});
