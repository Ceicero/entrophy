import { describe, expect, it } from 'vitest';
import { command } from '../commands/onboarding';

describe('/onboarding command definition', () => {
  const json = command.data.toJSON() as {
    default_member_permissions?: string | null;
    options?: { name: string }[];
  };

  it('sets no default member permission, so members can reach /onboarding checklist', () => {
    // Discord applies default_member_permissions to the WHOLE command, which would hide the member-facing
    // checklist. The staff subcommands are gated by assertStaffLevel in execute() instead.
    expect(json.default_member_permissions ?? null).toBeNull();
  });

  it('still offers the checklist subcommand alongside the staff ones', () => {
    expect(json.options?.map((option) => option.name)).toContain('checklist');
    expect(json.options?.map((option) => option.name)).toContain('rules-post');
  });
});
