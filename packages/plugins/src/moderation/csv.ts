// Formula-injection-safe CSV encoding, mirroring apps/api/src/lib/csv.ts (a separate package/app, so this is a
// small intentional duplicate rather than a cross-package dependency for ~20 lines of pure logic).
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@']);

function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);

  if (str.length > 0 && FORMULA_TRIGGER_CHARS.has(str[0])) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/** Serializes `rows` to CSV text (CRLF line endings, `columns` as header/order), escaping every cell against formula injection. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(','));
  }
  return lines.join('\r\n');
}
