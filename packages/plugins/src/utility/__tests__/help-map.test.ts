// Coverage test: every top-level command name actually registered by any loaded plugin must resolve, via
// `HELP_MAP`, to the plugin that actually owns it. Imports `allPlugins` only inside this test (not from
// `help-map.ts` itself) to avoid a cycle, per this build task's instructions — this also means the test keeps
// passing as other build stages add real commands, as long as they use the names already listed in
// ARCHITECTURE.md §7.1 (which `help-map.ts` transcribes in full).
import { describe, expect, it } from 'vitest';
import { allPlugins } from '../..';
import { HELP_MAP, OTHER_GROUP, resolvePluginForCommand } from '../help-map';

describe('HELP_MAP coverage', () => {
  it('maps every actually-registered top-level command/context-menu name to its true owning plugin', () => {
    const unmapped: string[] = [];
    const wrongOwner: string[] = [];

    for (const plugin of allPlugins) {
      for (const command of plugin.commands) {
        const name = command.data.name;
        if (!name) continue;

        const resolved = resolvePluginForCommand(name);
        if (resolved === OTHER_GROUP) {
          unmapped.push(`${name} (registered by ${plugin.manifest.id})`);
          continue;
        }
        if (resolved !== plugin.manifest.id) {
          wrongOwner.push(
            `${name}: HELP_MAP says "${resolved}" but it's registered by "${plugin.manifest.id}"`,
          );
        }
      }
    }

    expect(unmapped, `Commands missing from HELP_MAP: ${unmapped.join(', ')}`).toEqual([]);
    expect(wrongOwner, `Commands mapped to the wrong plugin: ${wrongOwner.join(', ')}`).toEqual([]);
  });

  it('falls back to OTHER_GROUP for an unrecognized command name', () => {
    expect(resolvePluginForCommand('totally-not-a-real-command')).toBe(OTHER_GROUP);
  });

  it('maps every utility command it declares to "utility"', () => {
    for (const name of ['help', 'utility', 'embed', 'User info']) {
      expect(HELP_MAP[name]).toBe('utility');
    }
  });
});
