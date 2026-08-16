import { errorEmbed, registerConfirmHandlers, successEmbed, type ComponentHandler } from '../../sdk';
import { buildCaseLogEmbed } from '../embeds';
import { moderationService } from '../commands/shared';

interface KickPayload {
  targetId: string;
  reason?: string;
  evidenceUrls: string[];
}

interface BanPayload extends KickPayload {
  deleteMessageSeconds: number;
  durationMs?: number;
}

type SoftbanPayload = BanPayload;

interface PurgePayload {
  channelId: string;
  count: number;
  userId?: string;
  contains?: string;
  reason?: string;
}

interface RolePayload {
  targetId: string;
  roleId: string;
  remove: boolean;
  reason?: string;
}

const kickHandlers = registerConfirmHandlers<KickPayload>('kick', async (c, payload) => {
  const service = moderationService(c.ctx);
  const row = await service.kick({
    guildId: c.guildId,
    moderatorId: c.interaction.user.id,
    source: 'BOT',
    ...payload,
  });
  await c.interaction.followUp({ embeds: [buildCaseLogEmbed(row)], ephemeral: true });
});

const banHandlers = registerConfirmHandlers<BanPayload>('ban', async (c, payload) => {
  const service = moderationService(c.ctx);
  const row = await service.ban({
    guildId: c.guildId,
    moderatorId: c.interaction.user.id,
    source: 'BOT',
    ...payload,
  });
  await c.interaction.followUp({ embeds: [buildCaseLogEmbed(row)], ephemeral: true });
});

const softbanHandlers = registerConfirmHandlers<SoftbanPayload>('softban', async (c, payload) => {
  const service = moderationService(c.ctx);
  const row = await service.softban({
    guildId: c.guildId,
    moderatorId: c.interaction.user.id,
    source: 'BOT',
    ...payload,
  });
  await c.interaction.followUp({ embeds: [buildCaseLogEmbed(row)], ephemeral: true });
});

const purgeHandlers = registerConfirmHandlers<PurgePayload>('purge', async (c, payload) => {
  const service = moderationService(c.ctx);
  try {
    const result = await service.purge({
      guildId: c.guildId,
      moderatorId: c.interaction.user.id,
      source: 'BOT',
      ...payload,
    });
    await c.interaction.followUp({
      embeds: [successEmbed(c.t('purge.success', { count: result.deletedCount }))],
      ephemeral: true,
    });
  } catch (err) {
    await c.interaction.followUp({
      embeds: [errorEmbed(err instanceof Error ? err.message : c.t('errors.generic'))],
      ephemeral: true,
    });
  }
});

const roleHandlers = registerConfirmHandlers<RolePayload>('role', async (c, payload) => {
  const service = moderationService(c.ctx);
  const row = await service.roleAction({
    guildId: c.guildId,
    moderatorId: c.interaction.user.id,
    source: 'BOT',
    ...payload,
  });
  await c.interaction.followUp({ embeds: [buildCaseLogEmbed(row)], ephemeral: true });
});

export const confirmationComponents: ComponentHandler[] = [
  ...kickHandlers,
  ...banHandlers,
  ...softbanHandlers,
  ...purgeHandlers,
  ...roleHandlers,
];
