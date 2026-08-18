import { describe, expect, it } from 'vitest';
import { parseDecisionArg } from '../components/decide';

describe('parseDecisionArg', () => {
  it('normalises a lowercase button arg to its uppercase decision', () => {
    expect(parseDecisionArg('warn')).toBe('WARN');
    expect(parseDecisionArg('dismiss')).toBe('DISMISS');
  });

  it('accepts an already-uppercase arg', () => {
    expect(parseDecisionArg('BAN')).toBe('BAN');
  });

  it('rejects "unmute" — it has no flag-queue button', () => {
    expect(parseDecisionArg('unmute')).toBeNull();
  });

  it('rejects an unknown decision', () => {
    expect(parseDecisionArg('bogus')).toBeNull();
  });

  it('rejects undefined', () => {
    expect(parseDecisionArg(undefined)).toBeNull();
  });
});
