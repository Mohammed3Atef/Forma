/**
 * SERVER-ONLY Bunny Edge Storage client. The storage password (`BUNNY_API_KEY`)
 * lives exclusively in the function's environment — it is never sent to, or
 * readable from, the browser. (Before this module existed the key shipped in
 * the Vite bundle as `VITE_BUNNY_API_KEY`, which let anyone upload to, list
 * and delete from the whole storage zone. That variable must be removed from
 * every environment and the zone password rotated — see
 * docs/FORMA_PRE_PHASE2_BLOCKER_PASS.md.)
 *
 * Why a proxy and not a presigned/scoped upload: Bunny's native Storage API
 * only authenticates with the zone password (no per-path or time-limited
 * tokens), and its S3-compatible presigned PUTs are only available on zones
 * CREATED with S3 compatibility enabled (public preview; cannot be switched on
 * for an existing zone). So the browser talks to `/api/media/*` with its own
 * session, and only this module talks to Bunny.
 */

export class MediaError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'MediaError';
    this.status = status;
    this.code = code;
  }
}

export interface BunnyConfig {
  zone: string;
  apiKey: string;
  cdnUrl: string;
  region: string;
}

export function bunnyConfig(): BunnyConfig | null {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const apiKey = process.env.BUNNY_API_KEY;
  const cdnUrl = process.env.BUNNY_CDN_URL;
  if (!zone || !apiKey || !cdnUrl) return null;
  return { zone, apiKey, cdnUrl: cdnUrl.replace(/\/$/, ''), region: process.env.BUNNY_STORAGE_REGION ?? '' };
}

export function isBunnyConfigured(): boolean {
  return bunnyConfig() !== null;
}

function storageHost(region: string): string {
  // Regional subdomains route to the right datacentre; default host = de region.
  return region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
}

/**
 * Storage API base URL. `BUNNY_STORAGE_ENDPOINT` (server-only, e.g.
 * `http://127.0.0.1:5299/storage`) points the client at a Bunny-compatible
 * stand-in for the isolated browser E2E environment (`e2e3/env/server.mjs`);
 * unset everywhere else, which gives the real regional host.
 */
function storageBase(cfg: BunnyConfig): string {
  const override = process.env.BUNNY_STORAGE_ENDPOINT?.replace(/\/$/, '');
  return override ? `${override}/${cfg.zone}` : `https://${storageHost(cfg.region)}/${cfg.zone}`;
}

function requireConfig(): BunnyConfig {
  const cfg = bunnyConfig();
  if (!cfg) throw new MediaError(503, 'notConfigured', 'Media uploads are not configured');
  return cfg;
}

/** PUTs one object and returns its public CDN URL. `path` is zone-relative (`Forma/...`), already validated by the policy layer. */
export async function putObject(path: string, contentType: string, body: Buffer): Promise<string> {
  const cfg = requireConfig();
  const url = `${storageBase(cfg)}/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: cfg.apiKey, 'Content-Type': contentType || 'application/octet-stream' },
    // Node's fetch (undici) accepts a Buffer; the DOM `BodyInit` typing this
    // project compiles against doesn't know that.
    body: body as unknown as RequestInit['body'],
  });
  if (!res.ok) throw new MediaError(502, 'failed', `Storage upload failed (${res.status})`);
  return `${cfg.cdnUrl}/${path}`;
}

// ---- Listing (super-admin media gallery, moved off the browser) ------------

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

async function listDir(cfg: BunnyConfig, relPath: string): Promise<BunnyListItem[]> {
  const dir = relPath.endsWith('/') ? relPath : `${relPath}/`;
  const res = await fetch(`${storageBase(cfg)}/${dir}`, {
    headers: { AccessKey: cfg.apiKey, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  return (await res.json().catch(() => [])) as BunnyListItem[];
}

/** Extensions the gallery renders via `<img>` — anything else (e.g. a `.pdf` message attachment) is skipped. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp']);
function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

/**
 * Recursively lists every uploaded image under `Forma/`, newest first. Still a
 * full walk of the zone on every call (same as before — see the performance
 * closeout in the old client module); the win here is only that it now runs
 * server-side under the super_admin guard instead of in the browser with the
 * storage password.
 */
export async function listAllImages(root = 'Forma', maxDepth = 4): Promise<CdnImage[]> {
  const cfg = requireConfig();
  const out: CdnImage[] = [];

  const walk = async (rel: string, depth: number): Promise<void> => {
    const items = await listDir(cfg, rel);
    await Promise.all(
      items.map(async (it) => {
        const childRel = `${rel.replace(/\/$/, '')}/${it.ObjectName}`;
        if (it.IsDirectory) {
          if (depth < maxDepth) await walk(childRel, depth + 1);
          return;
        }
        if (!isImageFile(it.ObjectName)) return;
        const parts = childRel.split('/'); // ["Forma", "{clientId}", …, "file"]
        out.push({
          url: `${cfg.cdnUrl}/${childRel}`,
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
