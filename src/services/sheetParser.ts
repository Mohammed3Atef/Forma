/**
 * Parsing helpers for the Import screen. Two supported inputs:
 *  1) Video-links JSON produced by the bundled Apps Script (scripts/extractVideoLinks.gs):
 *     [{ "name": "incline db press", "url": "https://..." }, ...]
 *  2) A generic CSV (future-proofing for re-importing the sheet as data).
 */

export interface VideoLinkRow {
  name?: string;
  exerciseId?: string;
  videoId?: string;
  url: string;
}

/** Minimal CSV parser that handles quoted fields and embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parse the video-links input (JSON array, or CSV with name,url columns). */
export function parseVideoLinks(input: string): VideoLinkRow[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  // JSON path
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    const arr = Array.isArray(data) ? data : (data.links ?? []);
    return arr
      .map((r: Record<string, unknown>) => ({
        name: typeof r.name === 'string' ? r.name : undefined,
        exerciseId: typeof r.exerciseId === 'string' ? r.exerciseId : undefined,
        videoId: typeof r.videoId === 'string' ? r.videoId : undefined,
        url: String(r.url ?? ''),
      }))
      .filter((r: VideoLinkRow) => r.url);
  }
  // CSV path: expect header row containing "url"
  const rows = parseCsv(trimmed);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const urlIdx = header.indexOf('url');
  const nameIdx = header.indexOf('name');
  if (urlIdx === -1) return [];
  return rows
    .slice(1)
    .map((r) => ({ name: nameIdx >= 0 ? r[nameIdx]?.trim() : undefined, url: r[urlIdx]?.trim() ?? '' }))
    .filter((r) => r.url);
}

/** Normalise a name for fuzzy matching against exercise names. */
export function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
