/**
 * A web address that is safe to render as a link, an image or a media source
 * (B3.6): only `https:` / `http:`. Anything else — `javascript:`, `data:`,
 * `blob:` from another origin, a bare string — is not rendered as a link. The
 * server refuses such attachment URLs since B3.6; this guards older rows.
 */
export function isWebUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
