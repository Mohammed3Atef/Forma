/**
 * Client-side CSV export (B3.8, owner D3) — no dependencies, no server round trip.
 *
 * Safety: a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed
 * with `'` so a spreadsheet never runs it as a formula (CSV injection; a client's name or a package
 * name is free text) — unless it is only a phone number or a plain signed number ("+20 100 123
 * 4567"), which cannot run anything and stays readable. Real numbers are written as numbers. Cells
 * with a comma, a quote or a line break are quoted. A UTF-8 BOM is prepended so Excel shows Arabic
 * correctly; lines end in CRLF.
 */
export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
/** Digits with phone punctuation only — no function, reference or command can hide in it. */
const PLAIN_NUMBER = /^[+-]?[\d\s().-]*\d[\d\s().-]*$/;

export function csvCell(v: CsvValue): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = FORMULA_START.test(v) && !PLAIN_NUMBER.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * Hands the file to the user. On a touch device the share sheet is used where it can carry a file
 * (an installed iOS app cannot download a blob reliably); otherwise — and whenever sharing fails —
 * a normal download.
 */
export async function saveCsv(filename: string, csv: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        // any other refusal: fall through to a download
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'downloaded';
}
