import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { parseDuration } from '@entrophy/core';
import { assertStaffLevel, buildCustomId, successEmbed, type ComponentHandler } from '../../sdk';
import type { EnforcerDecideInput } from '../../sdk/services';
import type { EnforcerConfig } from '../manifest';

type Decision = EnforcerDecideInput['decision'];

const REQUIRE_REASON_KEY: Partial<Record<Decision, 'warn' | 'timeout' | 'mute' | 'kick' | 'ban'>> = {
  WARN: 'warn',
  TIMEOUT: 'timeout',
  MUTE: 'mute',
  KICK: 'kick',
  BAN: 'ban',
};

function needsModal(decision: Decision, config: EnforcerConfig): boolean {
  if (decision === 'DISMISS') return false;
  const key = REQUIRE_REASON_KEY[decision];
  // Kick/Ban/Timeout/Mute always collect a reason and (for timeout/mute) a duration, or (for ban) a delete-days
  // window, through the modal even when a reason isn't strictly required — Warn is the one decision that can
  // skip the modal entirely when the server hasn't required a reason for it (ARCHITECTURE.md §19).
  if (decision === 'WARN') return Boolean(key && config.requireReasonOn.includes(key));
  return true;
}

/** `enforcer:decide:<recordId>:<decision>` — every allowed decision button on a flag-queue embed. */
const decideButtonHandler: ComponentHandler = {
  action: 'decide',
  kind: 'button',
  ownerOnly: false,
  // Host router requires at least `helper` for anyone to reach the handler at all (Dismiss/View context are
  // `helper`, ARCHITECTURE.md §19); the explicit `assertStaffLevel(..., 'moderator')` below still gates every
  // decision except DISMISS.
  requirement: { staffLevel: 'helper' },
  async handler(c) {
    const [recordId, decisionRaw] = c.args;
    const decision = decisionRaw as Decision;
    if (decision !== 'DISMISS') {
      assertStaffLevel(c.staffLevel, 'moderator', c.t);
    }

    const config = await c.config<EnforcerConfig>();

    if (!needsModal(decision, config)) {
      const interaction = c.interaction as ButtonInteraction<'cached'>;
      await interaction.deferUpdate();
      const enforcer = c.ctx.services.require('enforcer');
      const result = await enforcer.decide({
        guildId: c.guildId,
        recordId,
        decision,
        moderatorId: interaction.user.id,
        source: 'bot',
      });
      await interaction.followUp({
        embeds: [successEmbed(`Recorded **${decision}** on #E-${result.recordNumber}.`)],
        ephemeral: true,
      });
      return;
    }

    const reasonRequired = Boolean(
      REQUIRE_REASON_KEY[decision] && config.requireReasonOn.includes(REQUIRE_REASON_KEY[decision]!),
    );
    const rows = [
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(reasonRequired)
          .setMaxLength(1000),
      ),
    ];
    if (decision === 'TIMEOUT' || decision === 'MUTE') {
      rows.push(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Duration (e.g. 30m, 2h) — blank uses the server default')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20),
        ),
      );
    }
    if (decision === 'BAN') {
      rows.push(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('deleteDays')
            .setLabel('Delete messages from the last N days (0-7)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(1),
        ),
      );
    }

    const modal = new ModalBuilder()
      .setCustomId(buildCustomId('enforcer', 'decide-modal', recordId, decision))
      .setTitle(`${decision} — #E-${recordId.slice(-6)}`)
      .addComponents(...rows);
    await (c.interaction as ButtonInteraction<'cached'>).showModal(modal);
  },
};

/** `enforcer:decide-modal:<recordId>:<decision>` — the reason/duration/ban-delete modal submit. */
const decideModalHandler: ComponentHandler = {
  action: 'decide-modal',
  kind: 'modal',
  ownerOnly: false,
  requirement: { staffLevel: 'helper' },
  async handler(c) {
    const [recordId, decisionRaw] = c.args;
    const decision = decisionRaw as Decision;
    assertStaffLevel(c.staffLevel, 'moderator', c.t);

    const interaction = c.interaction as ModalSubmitInteraction<'cached'>;
    const reason = interaction.fields.getTextInputValue('reason').trim() || undefined;

    let durationMs: number | undefined;
    if (decision === 'TIMEOUT' || decision === 'MUTE') {
      const raw = interaction.fields.getTextInputValue('duration')?.trim();
      if (raw) durationMs = parseDuration(raw) ?? undefined;
    }

    let banDeleteMessageSeconds: number | undefined;
    if (decision === 'BAN') {
      const raw = interaction.fields.getTextInputValue('deleteDays')?.trim();
      const days = raw ? Number(raw) : NaN;
      if (Number.isFinite(days) && days >= 0)
        banDeleteMessageSeconds = Math.min(7, Math.floor(days)) * 86_400;
    }

    await interaction.deferReply({ ephemeral: true });
    const enforcer = c.ctx.services.require('enforcer');
    const result = await enforcer.decide({
      guildId: c.guildId,
      recordId,
      decision,
      moderatorId: interaction.user.id,
      reason,
      durationMs,
      banDeleteMessageSeconds,
      source: 'bot',
    });
    await interaction.editReply({
      embeds: [successEmbed(`Recorded **${decision}** on #E-${result.recordNumber}.`)],
    });
  },
};

export const decideComponents: ComponentHandler[] = [decideButtonHandler, decideModalHandler];
