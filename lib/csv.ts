// Builds a CSV that Excel opens cleanly (BOM for Gujarati/Hindi names, CRLF line endings)
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

// Same normalisation used to detect duplicate names (case, spaces and punctuation ignored)
export const nameKey = (name: string) => name.toLowerCase().replace(/[^\p{L}]/gu, '');
