import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

/** B3.8 exports (owner D3): CSV-safe cells — formulas never run, numbers stay numbers. */
describe('csv', () => {
  it('neutralises cells that a spreadsheet would run as a formula', () => {
    for (const v of ['=1+1', '+SUM(1)', "-2+3+cmd|' /C calc'!A0", '@SUM(A1)', '\tx', '\rx']) expect(csvCell(v).startsWith("'") || csvCell(v).startsWith('"\'')).toBe(true);
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    // a phone number or a plain signed number can't run anything — it stays as typed
    expect(csvCell('+20 100 123 4567')).toBe('+20 100 123 4567');
    expect(csvCell('-5')).toBe('-5');
  });

  it('keeps numbers numeric (negatives included) and quotes commas, quotes and line breaks', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Salma, Cairo')).toBe('"Salma, Cairo"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('سلمى فتحي')).toBe('سلمى فتحي');
  });

  it('a BOM, a header row and CRLF line ends', () => {
    expect(toCsv(['Name', 'Price'], [['Aya', 900], ['=x', null]])).toBe('﻿Name,Price\r\nAya,900\r\n\'=x,');
  });
});
