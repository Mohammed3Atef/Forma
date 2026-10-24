/**
 * What a video link can actually do inside Forma (B0 / CL-20, MD-09). Every
 * surface that offers or plays an exercise video goes through this, so a
 * button is only shown when something can play, and coach-entered links are
 * validated against the same rule.
 *
 *  - `youtube`     a recognisable YouTube video → privacy-enhanced embed
 *  - `file`        an https link to a video file (mp4/webm/mov/m4v/ogg) — e.g.
 *                  a Forma upload; may still be a codec the device can't play
 *                  (iPhone HEVC .mov), which the player reports honestly
 *  - `unsupported` anything else (Google Drive, Vimeo, Instagram, web pages,
 *                  non-https, `javascript:`) — never offered as playable.
 *                  Plain http is accepted only on loopback hosts (local dev /
 *                  the isolated test CDN); real hosts must be https.
 */
export type VideoSource =
  | { kind: 'youtube'; embedUrl: string; openUrl: string }
  | { kind: 'file'; url: string; maybeHevc: boolean }
  | { kind: 'unsupported'; reason: 'invalid' | 'host' };

const YT_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
const FILE_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;

export function classifyVideoUrl(raw: string | null | undefined): VideoSource | null {
  const value = raw?.trim();
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { kind: 'unsupported', reason: 'invalid' };
  }
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return { kind: 'unsupported', reason: 'invalid' };
  if (YT_HOSTS.test(u.hostname)) {
    const id =
      u.hostname.toLowerCase().endsWith('youtu.be')
        ? u.pathname.slice(1).split('/')[0]
        : u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? '';
    if (/^[\w-]{11}$/.test(id)) {
      return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, openUrl: `https://www.youtube.com/watch?v=${id}` };
    }
    return { kind: 'unsupported', reason: 'host' };
  }
  if (FILE_EXT.test(u.pathname)) return { kind: 'file', url: u.toString(), maybeHevc: /\.(mov)$/i.test(u.pathname) };
  return { kind: 'unsupported', reason: 'host' };
}

/** True when the link can be offered as a playable video. */
export function isPlayableVideoUrl(raw: string | null | undefined): boolean {
  const s = classifyVideoUrl(raw);
  return !!s && s.kind !== 'unsupported';
}

/** An http(s) link that is safe to render as `<a href>` (never `javascript:` / `data:`). */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  try {
    const u = new URL(raw?.trim() ?? '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
