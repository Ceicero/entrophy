import type { SlashCommandBuilder } from 'discord.js';
import { assertStaffLevel, errorEmbed, infoEmbed, type CommandContext } from '../../sdk';

export function addRecordSubcommand(builder: SlashCommandBuilder): SlashCommandBuilder {
  return builder.addSubcommand((sub) =>
    sub
      .setName('record')
      .setDescription('View a ledger record in detail.')
      .addIntegerOption((opt) =>
        opt
          .setName('number')
          .setDescription('Record number, e.g. 12 for #E-12.')
          .setRequired(true)
          .setMinValue(1),
      ),
  ) as SlashCommandBuilder;
}

export async function executeRecord(c: CommandContext): Promise<void> {
  assertStaffLevel(c.staffLevel, 'helper', c.t);

  const number = c.interaction.options.getInteger('number', true);
  const record = await c.ctx.prisma.enforcerRecord.findUnique({
    where: { guildId_recordNumber: { guildId: c.guildId, recordNumber: number } },
  });
  if (!record) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('record.notFound'))], ephemeral: true });
    return;
  }

  let caseNumber: number | null = null;
  if (record.caseId) {
    const moderationCase = await c.ctx.prisma.moderationCase.findUnique({ where: { id: record.caseId } });
    caseNumber = moderationCase?.caseNumber ?? null;
  }

  const contextSnapshot = Array.isArray(record.contextSnapshot)
    ? (record.contextSnapshot as { authorId: string; at: string; excerpt: string }[])
    : [];

  const lines = [
    `User: <@${record.userId}> (\`${record.userId}\`)`,
    `Kind: ${record.kind}`,
    `Status: ${record.status ?? '_n/a_'}`,
    `Source: ${record.source}`,
    `When: <t:${Math.floor(record.createdAt.getTime() / 1000)}:F>`,
    record.policyName ? `Policy: ${record.policyName}` : undefined,
    record.matcherSummary ? `Matched: ${record.matcherSummary}` : undefined,
    record.decision
      ? `Decision: ${record.decision} by <@${record.decidedBy}>${record.decisionReason ? ` — ${record.decisionReason}` : ''}`
      : undefined,
    caseNumber !== null ? `Case: #${caseNumber}` : undefined,
    record.excerpt ? `Excerpt: ${record.excerpt}` : undefined,
    record.messageJumpUrl ? `[Jump to message](${record.messageJumpUrl})` : undefined,
    contextSnapshot.length > 0
      ? `\n**Context before**\n${contextSnapshot.map((m) => `<@${m.authorId}>: ${m.excerpt}`).join('\n')}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  await c.interaction.reply({
    embeds: [infoEmbed(c.t('record.detailTitle', { number }), lines.join('\n'))],
    ephemeral: true,
  });
}
