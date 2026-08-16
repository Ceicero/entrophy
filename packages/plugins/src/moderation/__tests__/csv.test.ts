import { describe, expect, it } from 'vitest';
import { toCsv } from '../csv';

describe('toCsv', () => {
  it('writes a header row followed by data rows, CRLF-joined', () => {
    const csv = toCsv(
      [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
      ],
      ['a', 'b'],
    );
    expect(csv).toBe('a,b\r\n1,x\r\n2,y');
  });

  it('quotes cells containing commas, quotes, or newlines, doubling embedded quotes', () => {
    const csv = toCsv([{ reason: 'said "hi", then left\nnext line' }], ['reason']);
    expect(csv).toBe('reason\r\n"said ""hi"", then left\nnext line"');
  });

  it('prefixes formula-trigger characters with a single quote to defuse CSV formula injection', () => {
    const csv = toCsv(
      [{ reason: '=cmd()' }, { reason: '+1' }, { reason: '-1' }, { reason: '@SUM(A1)' }],
      ['reason'],
    );
    const rows = csv.split('\r\n').slice(1);
    expect(rows).toEqual(["'=cmd()", "'+1", "'-1", "'@SUM(A1)"]);
  });

  it('renders null/undefined cells as empty strings', () => {
    const csv = toCsv([{ reason: null }, { reason: undefined }], ['reason']);
    expect(csv).toBe('reason\r\n\r\n');
  });
});
