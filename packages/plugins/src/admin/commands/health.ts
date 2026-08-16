import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { assertStaffLevel, brandEmbed, type PluginCommand } from '../../sdk';
import { formatUptime } from '../format';

const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription("Show the bot's health and per-plugin status.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

function healthEmoji(status: 'ok' | 'degraded' | 'unavailable' | 'disabled'): string {
  switch (status) {
    case 'ok':
      return '🟢';
    case 'degraded':
      return '🟡';
    case 'unavailable':
      return '🔴';
    case 'disabled':
    default:
      return '⚪';
  }
}

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'moderator', guildOnly: true },
  async execute(c) {
    assertStaffLevel(c.staffLevel, 'moderator', c.t);
    const host = c.ctx.services.require('host');
    const stats = host.getBotStats();

    let redisOk = false;
    try {
      redisOk = (await c.ctx.redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }

    let dbOk = false;
    try {
      await c.ctx.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const manifests = host.listManifests();
    const pluginLines: string[] = [];
    for (const manifest of manifests) {
      const health = await host.getPluginHealth(manifest.id);
      const status = health?.status ?? 'disabled';
      pluginLines.push(
        `${healthEmoji(status)} **${manifest.name}**: ${health ? status : 'no health check reported'}${health?.details ? ` — ${health.details}` : ''}`,
      );
    }

    const embed = brandEmbed()
      .setTitle(c.t('health.title'))
      .addFields(
        { name: c.t('health.gatewayPing'), value: `${stats.wsPingMs}ms`, inline: true },
        { name: c.t('health.uptime'), value: formatUptime(stats.uptimeSec), inline: true },
        { name: c.t('health.guilds'), value: String(stats.guildCount), inline: true },
        { name: c.t('health.memory'), value: `${stats.memoryMb.toFixed(1)} MB`, inline: true },
        { name: c.t('health.redis'), value: redisOk ? '✅ OK' : '❌ Unreachable', inline: true },
        { name: c.t('health.database'), value: dbOk ? '✅ OK' : '❌ Unreachable', inline: true },
        { name: c.t('health.plugins'), value: pluginLines.join('\n').slice(0, 1024) },
      );

    await c.interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
