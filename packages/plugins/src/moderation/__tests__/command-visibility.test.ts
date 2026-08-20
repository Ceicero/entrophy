import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { command as modCommand } from '../commands/mod';
import { command as casesMenuCommand } from '../commands/context-menu-cases';

/** The permissions the shipped `Helper` role actually carries (infra/hub/hub-plan.json). */
const HELPER_PERMISSIONS = new PermissionsBitField(
  PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ManageThreads,
);

function defaultMemberPermissions(command: { data: { toJSON: () => unknown } }): bigint {
  const json = command.data.toJSON() as { default_member_permissions?: string | null };
  return BigInt(json.default_member_permissions ?? 0);
}

describe('Discord-side visibility of helper-level moderation commands', () => {
  it('/mod is helper-level and its Discord gate does not exclude helpers', () => {
    expect(modCommand.requirement?.staffLevel).toBe('helper');
    expect(HELPER_PERMISSIONS.has(defaultMemberPermissions(modCommand))).toBe(true);
  });

  it('the View cases context menu is helper-level and gated the same way', () => {
    expect(casesMenuCommand.requirement?.staffLevel).toBe('helper');
    expect(HELPER_PERMISSIONS.has(defaultMemberPermissions(casesMenuCommand))).toBe(true);
  });
});
