import { describe, expect, it } from 'vitest';
import type { ComponentContext } from '../../sdk';
import { createTestContext } from '../../sdk/testing';
import { panelToggleHandler } from '../components/panel-toggle';

interface FakeOption {
  id: string;
  roleId: string;
}

interface FakeGroup {
  id: string;
  name: string;
  roleIds: string[];
  exclusive: boolean;
  maxSelections: number | null;
}

/**
 * Drives `roles:toggle` with an in-memory member/guild. Every role in `roleIds` is a plain, low-position role
 * (nothing elevated or managed) so `checkRoleAssignable` always passes and the test is about the group wiring.
 */
function setup(input: {
  options: FakeOption[];
  group?: FakeGroup;
  held: string[];
  roleIds: string[];
}) {
  const held = new Set(input.held);
  const added: string[] = [];
  const removed: string[] = [];
  const replies: string[] = [];

  const { ctx } = createTestContext({
    prismaOverrides: {
      rolePanel: {
        findFirst: () =>
          Promise.resolve({
            id: 'panel1',
            guildId: 'g1',
            title: 'Colours',
            groupId: input.group?.id ?? null,
            options: input.options,
          }),
      },
      roleGroup: { findUnique: () => Promise.resolve(input.group ?? null) },
    },
  });

  const roleCache = new Map(
    input.roleIds.map((id) => [id, { id, permissions: { bitfield: 0n }, position: 1, managed: false }]),
  );

  const toList = (ids: string | string[]) => (Array.isArray(ids) ? ids : [ids]);
  const interaction = {
    guild: {
      roles: { fetch: () => Promise.resolve(undefined), cache: roleCache },
      members: { me: { roles: { highest: { position: 10 } } } },
    },
    member: {
      roles: {
        cache: { has: (id: string) => held.has(id) },
        add: (ids: string | string[]) => {
          for (const id of toList(ids)) {
            added.push(id);
            held.add(id);
          }
          return Promise.resolve(undefined);
        },
        remove: (ids: string | string[]) => {
          for (const id of toList(ids)) {
            removed.push(id);
            held.delete(id);
          }
          return Promise.resolve(undefined);
        },
      },
    },
    user: { id: 'u1' },
    reply: (payload: { embeds: { data: { description?: string } }[] }) => {
      replies.push(payload.embeds[0].data.description ?? '');
      return Promise.resolve(undefined);
    },
  };

  async function click(optionId: string) {
    const c = {
      interaction,
      ctx,
      guildId: 'g1',
      args: ['panel1', optionId],
      config: () => Promise.resolve({ allowElevatedRoles: false }),
    } as unknown as ComponentContext;
    await panelToggleHandler.handler(c);
  }

  return { click, added, removed, replies, held };
}

describe('panelToggleHandler — group-bound button panels', () => {
  const options = [
    { id: 'opt-red', roleId: 'red' },
    { id: 'opt-blue', roleId: 'blue' },
  ];
  const exclusiveGroup = {
    id: 'grp1',
    name: 'Colours',
    roleIds: ['red', 'blue'],
    exclusive: true,
    maxSelections: null,
  };

  it('swaps the held role when a member clicks a different role in an exclusive group', async () => {
    const { click, added, removed, replies } = setup({
      options,
      group: exclusiveGroup,
      held: ['red'],
      roleIds: ['red', 'blue'],
    });

    await click('opt-blue');

    expect(added).toEqual(['blue']);
    expect(removed).toEqual(['red']);
    expect(replies[0]).toContain('Added: <@&blue>');
    expect(replies[0]).toContain('Removed: <@&red>');
  });

  it('drops the oldest pick when a capped group is already full', async () => {
    const { click, added, removed } = setup({
      options: [...options, { id: 'opt-green', roleId: 'green' }],
      group: {
        id: 'grp1',
        name: 'Colours',
        roleIds: ['red', 'blue', 'green'],
        exclusive: false,
        maxSelections: 2,
      },
      held: ['red', 'blue'],
      roleIds: ['red', 'blue', 'green'],
    });

    await click('opt-green');

    expect(added).toEqual(['green']);
    expect(removed).toEqual(['blue']);
  });

  it('still grants a panel option whose role is not part of the panel group', async () => {
    const { click, added, replies } = setup({
      options: [...options, { id: 'opt-pink', roleId: 'pink' }],
      group: exclusiveGroup,
      held: [],
      roleIds: ['red', 'blue', 'pink'],
    });

    await click('opt-pink');

    expect(added).toEqual(['pink']);
    expect(replies[0]).toContain('<@&pink>');
  });

  it('toggles a held role off before any group handling', async () => {
    const { click, added, removed } = setup({
      options,
      group: exclusiveGroup,
      held: ['red'],
      roleIds: ['red', 'blue'],
    });

    await click('opt-red');

    expect(added).toEqual([]);
    expect(removed).toEqual(['red']);
  });
});
