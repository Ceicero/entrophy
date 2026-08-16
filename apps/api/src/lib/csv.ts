// Formula-injection-safe CSV encoding (SPEC.md §"SECURITY REQUIREMENTS" / ARCHITECTURE.md §10).
// Cells opened in Excel/Sheets that start with = + - @ can be interpreted as formulas; prefixing
// them with a literal single quote defuses that while keeping the value human-readable.
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

/**
 * Serializes `rows` to CSV text (CRLF line endings), using `columns` as the header/column order
 * (defaults to the keys of the first row). Every cell is escaped against CSV-formula injection.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(cols.map((col) => escapeCsvCell(row[col])).join(','));
  }
  return lines.join('\r\n');
}
