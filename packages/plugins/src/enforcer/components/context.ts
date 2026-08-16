import type { ButtonInteraction } from 'discord.js';
import { errorEmbed, infoEmbed, type ComponentHandler } from '../../sdk';
import { buildContextSnapshot } from '../service';
import type { EnforcerConfig } from '../manifest';

/** `enforcer:context:<recordId>` — "View context": live fetch when possible, falling back to the stored snapshot. */
const contextHandler: ComponentHandler = {
  action: 'context',
  kind: 'button',
  ownerOnly: false,
  requirement: { staffLevel: 'helper' },
  async handler(c) {
    const [recordId] = c.args;
    const interaction = c.interaction as ButtonInteraction<'cached'>;

    const record = await c.ctx.prisma.enforcerRecord.findFirst({ where: { id: recordId, guildId: c.guildId } });
    if (!record) {
      await interaction.reply({ embeds: [errorEmbed(c.t('record.notFound'))], ephemeral: true });
      return;
    }

    const config = await c.config<EnforcerConfig>();
    let lines: string[] = [];

    if (record.channelId && record.messageId) {
      const live = await buildContextSnapshot(interaction.guild, record.channelId, record.messageId, config.contextBefore, config.excerptMaxChars).catch(() => null);
      if (live && live.length > 0) {
        lines = live.map((m) => `<@${m.authorId}>: ${m.excerpt}`);
      }
    }

    if (lines.length === 0 && Array.isArray(record.contextSnapshot)) {
      const snapshot = record.contextSnapshot as { authorId: string; excerpt: string }[];
      lines = snapshot.map((m) => `<@${m.authorId}>: ${m.excerpt} _(from stored snapshot)_`);
    }

    if (record.excerpt) lines.push(`**Flagged message** — <@${record.userId}>: ${record.excerpt}`);
    if (record.messageJumpUrl) lines.push(`[Jump to message](${record.messageJumpUrl})`);

    if (lines.length === 0) {
      lines = ['No context is available for this record (context capture was off, or the message/channel is no longer reachable).'];
    }

    await interaction.reply({ embeds: [infoEmbed(`Context for #E-${record.recordNumber}`, lines.join('\n'))], ephemeral: true });
  },
};

export const contextComponents: ComponentHandler[] = [contextHandler];
