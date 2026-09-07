import { describe, expect, it } from 'vitest';
import { resolvePrefixOptions } from '../prefix/options';

/**
 * `+level` (a command that only exists as subcommands) used to fall through the option binder with no
 * subcommand selected, so `getSubcommand(true)` threw inside the handler and the router rendered a bare
 * "Something went wrong. Please try again." — which tells someone who just discovered the prefix nothing at
 * all. Verified live in Discord before the fix.
 */

// Mirrors the shape of `new SlashCommandBuilder()...toJSON()` for a subcommand-only command.
const levelCommand = {
  options: [
    { type: 1, name: 'rank', description: 'Show your rank.' },
    { type: 1, name: 'leaderboard', description: 'Show the leaderboard.' },
    { type: 2, name: 'config', description: 'Configure leveling.', options: [] },
  ],
};

const message = { guild: { members: { cache: new Map() } }, attachments: new Map() } as never;

describe('a command needing a subcommand explains itself instead of throwing', () => {
  it('lists the available subcommands when none was given', () => {
    const result = resolvePrefixOptions(levelCommand, [], message, 'level');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('rank');
    expect(result.error).toContain('leaderboard');
    expect(result.error).toContain('config');
    expect(result.usage).toContain('level');
  });

  it('names the offending token when the subcommand is not recognised', () => {
    const result = resolvePrefixOptions(levelCommand, ['bogus'], message, 'level');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('bogus');
    expect(result.error).toContain('rank');
  });

  it('still resolves normally once a real subcommand is supplied', () => {
    const result = resolvePrefixOptions(levelCommand, ['rank'], message, 'level');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.subcommand).toBe('rank');
  });

  it('leaves commands without subcommands alone', () => {
    const simple = { options: [{ type: 3, name: 'query', description: 'A string.', required: false }] };

    const result = resolvePrefixOptions(simple, [], message, 'ask');

    expect(result.ok).toBe(true);
  });
});
