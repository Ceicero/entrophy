import { describe, expect, it } from 'vitest';
import { buildCustomId, parseCustomId } from '../src/sdk';

describe('buildCustomId / parseCustomId', () => {
  it('joins pluginId, action, and args with colons', () => {
    const id = buildCustomId('moderation', 'confirm-ban', 'user123', 'case456');
    expect(id).toBe('moderation:confirm-ban:user123:case456');
  });

  it('coerces non-string args to strings', () => {
    const id = buildCustomId('community', 'page', 'user123', 3);
    expect(id).toBe('community:page:user123:3');
  });

  it('round-trips through parseCustomId', () => {
    const id = buildCustomId('admin', 'wizard-role-admin', 'user123', 'extra');
    const parsed = parseCustomId(id);
    expect(parsed).toEqual({ pluginId: 'admin', action: 'wizard-role-admin', args: ['user123', 'extra'] });
  });

  it('throws when the built id exceeds 100 characters', () => {
    const longArg = 'x'.repeat(100);
    expect(() => buildCustomId('admin', 'some-action', longArg)).toThrow(/100 characters/);
  });

  it('parseCustomId handles ids with no args', () => {
    expect(parseCustomId('admin:health')).toEqual({ pluginId: 'admin', action: 'health', args: [] });
  });

  it('parseCustomId handles an empty string gracefully', () => {
    expect(parseCustomId('')).toEqual({ pluginId: '', action: '', args: [] });
  });
});
