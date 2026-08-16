import { PermissionFlagsBits } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { createRolesService } from '../service';
import { filterAssignableRoles } from '../service';

function fakeRole(id: string, opts: { permissions?: bigint; position?: number; managed?: boolean } = {}) {
  return { id, permissions: { bitfield: opts.permissions ?? 0n }, position: opts.position ?? 1, managed: opts.managed ?? false };
}

function fakeGuild(roles: ReturnType<typeof fakeRole>[], botTopPosition = 10) {
  const cache = new Map(roles.map((r) => [r.id, r]));
  return {
    members: { me: { roles: { highest: { position: botTopPosition } } } },
    roles: { cache },
  } as unknown as import('discord.js').Guild;
}

describe('filterAssignableRoles', () => {
  it('allows safe roles and skips elevated/managed/high-position roles with a reason', () => {
    const guild = fakeGuild([
      fakeRole('safe', { permissions: PermissionFlagsBits.SendMessages, position: 2 }),
      fakeRole('elevated', { permissions: PermissionFlagsBits.BanMembers, position: 2 }),
      fakeRole('managed', { managed: true, position: 2 }),
      fakeRole('toohigh', { position: 15 }),
    ]);

    const { allowed, skipped } = filterAssignableRoles(guild, ['safe', 'elevated', 'managed', 'toohigh', 'missing'], false);

    expect(allowed).toEqual(['safe']);
    expect(skipped.map((s) => s.roleId).sort()).toEqual(['elevated', 'managed', 'missing', 'toohigh'].sort());
  });

  it('allows elevated roles when allowElevatedRoles is true', () => {
    const guild = fakeGuild([fakeRole('elevated', { permissions: PermissionFlagsBits.BanMembers, position: 2 })]);
    const { allowed } = filterAssignableRoles(guild, ['elevated'], true);
    expect(allowed).toEqual(['elevated']);
  });
});

describe('createRolesService — verificationDecision', () => {
  it('is a no-op when the request is already decided (double-decision guard)', async () => {
    let updateCalled = false;
    const { ctx } = createTestContext({
      prismaOverrides: {
        verificationRequest: {
          findFirst: () => Promise.resolve({ id: 'req1', guildId: 'g1', userId: 'u1', status: 'APPROVED', staffMessageId: null }),
          update: () => {
            updateCalled = true;
            return Promise.resolve({});
          },
        },
      },
    });

    const service = createRolesService(ctx);
    await service.verificationDecision({ guildId: 'g1', requestId: 'req1', approve: true, reviewerId: 'mod1' });

    expect(updateCalled).toBe(false);
  });

  it('throws NotFoundError when the request does not exist', async () => {
    const { ctx } = createTestContext({ prismaOverrides: { verificationRequest: { findFirst: () => Promise.resolve(null) } } });
    const service = createRolesService(ctx);
    await expect(service.verificationDecision({ guildId: 'g1', requestId: 'missing', approve: true, reviewerId: 'mod1' })).rejects.toThrow();
  });

  it('supports the bot-actions single-object call shape for postPanel/testWelcome/verificationDecision', async () => {
    const { ctx } = createTestContext({ prismaOverrides: { verificationRequest: { findFirst: () => Promise.resolve(null) } } });
    const service = createRolesService(ctx);
    // apps/bot/src/host/bot-actions.ts calls `method.call(service, { guildId, payload, requestedBy })`.
    const dual = service.verificationDecision as unknown as (arg: { guildId: string; payload: { requestId: string; approve: boolean }; requestedBy: string }) => Promise<void>;
    await expect(dual({ guildId: 'g1', payload: { requestId: 'missing', approve: true }, requestedBy: 'mod1' })).rejects.toThrow();
  });
});
