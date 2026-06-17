/**
 * Bunny CDN image upload (client-side). Forma has no server, so the upload runs
 * in the browser with the Bunny Storage key read from `import.meta.env`. Files
 * land under the `Forma/` folder of the configured storage zone and are served
 * from the public pull-zone host (`VITE_BUNNY_CDN_URL`).
 *
 * NOTE: the storage key is present in the shipped bundle and the resulting URLs
 * are public (unguessable random keys, but not access-controlled). Acceptable
 * for this app per product decision; harden later with a dedicated zone/proxy.
 */

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadErrorCode = 'notConfigured' | 'badType' | 'tooLarge' | 'failed';

export class UploadError extends Error {
  code: UploadErrorCode;
  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UploadError';
    this.code = code;
  }
}

export interface UploadResult {
  url: string;
  size: number;
}

function cfg() {
  return {
    zone: import.meta.env.VITE_BUNNY_STORAGE_ZONE,
    apiKey: import.meta.env.VITE_BUNNY_API_KEY,
    cdnUrl: import.meta.env.VITE_BUNNY_CDN_URL,
    region: import.meta.env.VITE_BUNNY_STORAGE_REGION,
  };
}

/** True when zone + key + public CDN URL are all configured. */
export function isBunnyConfigured(): boolean {
  const { zone, apiKey, cdnUrl } = cfg();
  return Boolean(zone && apiKey && cdnUrl);
}

function randomKey(): string {
  const a = Math.random().toString(36).slice(2, 10);
  const b = Date.now().toString(36);
  return `${a}${b}`;
}

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Upload an image blob to Bunny storage under `{folder}/{random}.{ext}` and
 * return its public CDN URL. Validates type + size; throws `UploadError` with a
 * machine code the UI can localise.
 */
export async function uploadImageToBunny(file: Blob, opts: { folder: string }): Promise<UploadResult> {
  const { zone, apiKey, cdnUrl, region } = cfg();
  if (!zone || !apiKey || !cdnUrl) throw new UploadError('notConfigured');
  if (!ALLOWED_MIME.has(file.type)) throw new UploadError('badType');
  if (file.size > MAX_BYTES) throw new UploadError('tooLarge');

  const ext = extFor(file.type);
  const folder = opts.folder.replace(/^\/+|\/+$/g, '');
  const path = `${folder}/${randomKey()}.${ext}`;
  // Regional subdomains route to the right datacentre; default host = de region.
  const storageHost = region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
  const uploadUrl = `https://${storageHost}/${zone}/${path}`;

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { AccessKey: apiKey, 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
  } catch (e) {
    throw new UploadError('failed', e instanceof Error ? e.message : 'network error');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new UploadError('failed', `Bunny upload failed (${res.status}): ${text || res.statusText}`);
  }
  const publicBase = cdnUrl.replace(/\/$/, '');
  return { url: `${publicBase}/${path}`, size: file.size };
}

// ---- Listing (super-admin media gallery) -----------------------------------

interface BunnyListItem {
  ObjectName: string;
  Length: number;
  IsDirectory: boolean;
  LastChanged?: string;
  DateCreated?: string;
}

export interface CdnImage {
  url: string; // public CDN URL
  path: string; // relative path under the zone, e.g. "Forma/{clientId}/x.webp"
  name: string;
  clientId: string; // parsed from `Forma/{clientId}/…`
  context: 'progress' | 'assessment' | 'other';
  size: number;
  lastChanged?: string;
}

function storageHost(): string {
  const { region } = cfg();
  return region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
}

async function listDir(relPath: string): Promise<BunnyListItem[]> {
  const { zone, apiKey } = cfg();
  if (!zone || !apiKey) return [];
  const dir = relPath.endsWith('/') ? relPath : `${relPath}/`;
  const res = await fetch(`https://${storageHost()}/${zone}/${dir}`, {
    headers: { AccessKey: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  return (await res.json().catch(() => [])) as BunnyListItem[];
}

/**
 * Recursively list every uploaded image under the `Forma/` folder (super-admin
 * media gallery). Returns files with their public CDN URLs, newest first.
 */
export async function listAllImages(root = 'Forma', maxDepth = 4): Promise<CdnImage[]> {
  const { zone, apiKey, cdnUrl } = cfg();
  if (!zone || !apiKey || !cdnUrl) throw new UploadError('notConfigured');
  const base = cdnUrl.replace(/\/$/, '');
  const out: CdnImage[] = [];

  const walk = async (rel: string, depth: number): Promise<void> => {
    const items = await listDir(rel);
    await Promise.all(
      items.map(async (it) => {
        const childRel = `${rel.replace(/\/$/, '')}/${it.ObjectName}`;
        if (it.IsDirectory) {
          if (depth < maxDepth) await walk(childRel, depth + 1);
          return;
        }
        const parts = childRel.split('/'); // ["Forma", "{clientId}", …, "file"]
        out.push({
          url: `${base}/${childRel}`,
          path: childRel,
          name: it.ObjectName,
          clientId: parts[1] ?? '',
          context: childRel.includes('/assessment/') ? 'assessment' : parts.length === 3 ? 'progress' : 'other',
          size: it.Length ?? 0,
          lastChanged: it.LastChanged ?? it.DateCreated,
        });
      }),
    );
  };

  await walk(root, 0);
  return out.sort((a, b) => (b.lastChanged ?? '').localeCompare(a.lastChanged ?? ''));
}
