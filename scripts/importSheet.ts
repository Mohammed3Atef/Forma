/**
 * CLI: transform Google Sheet data (or a local CSV) into app-importable JSON.
 *
 * Usage:
 *   node --experimental-strip-types scripts/importSheet.ts <sheetId> <gid>
 *     → fetches the *public* sheet tab as CSV and prints parsed rows as JSON.
 *
 *   node --experimental-strip-types scripts/importSheet.ts --csv ./file.csv
 *     → parses a local CSV file and prints rows as JSON.
 *
 * Note: video links inserted as hyperlinks are NOT present in CSV exports —
 * use scripts/extractVideoLinks.gs for those, then paste into the Import screen.
 */

import { readFileSync } from 'node:fs';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let csv: string;
  if (args[0] === '--csv' && args[1]) {
    csv = readFileSync(args[1], 'utf8');
  } else if (args[0] && args[1]) {
    const [sheetId, gid] = args;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch sheet: HTTP ${res.status}. Is it shared as "Anyone with the link"?`);
    csv = await res.text();
  } else {
    console.error('Usage: importSheet.ts <sheetId> <gid>  |  --csv <file>');
    process.exit(1);
    return;
  }

  const rows = parseCsv(csv);
  process.stdout.write(JSON.stringify({ rowCount: rows.length, rows }, null, 2) + '\n');
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
