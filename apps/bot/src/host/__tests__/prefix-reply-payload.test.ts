import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createMessageCommandInteraction } from '../prefix/message-command-interaction';
import type { ResolvedOptions } from '../prefix/options';

/**
 * Regression guard for the bug that made `+help` fail silently in production.
 *
 * The adapter used to `structuredClone()` the reply payload before handing it to `message.reply()`. A deep
 * clone strips the prototype off a discord.js builder, so an `EmbedBuilder`/`ActionRowBuilder` arrived as a
 * plain `{ data: ... }` object, `.toJSON()` was never called on it, and Discord rejected the request with
 * `components[0][TAG_FIELD_MISSING]` / `embeds[0].description[BASE_TYPE_REQUIRED]`. The command threw, and
 * the router's own error reply hit the same bug, so the user saw nothing at all.
 *
 * Every plugin command replies with builders, so these assert on builder identity rather than on the shape
 * of the serialized payload — that is the property that actually broke.
 */

const emptyResolved: ResolvedOptions = { subcommandGroup: null, subcommand: null, values: new Map() };

function mockMessage() {
  const reply = vi.fn().mockResolvedValue({ id: 'sent-1', edit: vi.fn() });
  const send = vi.fn().mockResolvedValue({ id: 'sent-2' });
  return {
    reply,
    send,
    message: {
      id: 'msg-1',
      content: '+help',
      guildId: 'guild-1',
      channelId: 'chan-1',
      createdAt: new Date(),
      createdTimestamp: Date.now(),
      author: { id: 'user-1', bot: false, username: 'tester' },
      member: { id: 'user-1', permissions: { bitfield: 8n, has: () => true } },
      guild: { id: 'guild-1', preferredLocale: 'en-US', members: { me: {} } },
      client: { user: { id: 'bot-1' }, application: { id: 'app-1' } },
      attachments: new Map(),
      channel: { guild: { id: 'guild-1' }, send, sendTyping: vi.fn().mockResolvedValue(undefined) },
      reply,
    },
  };
}

function buildInteraction(msg: ReturnType<typeof mockMessage>['message']) {
  return createMessageCommandInteraction({
    // The adapter only needs the members exercised here; the production call site passes a real Message.
    message: msg as never,
    commandName: 'help',
    resolved: emptyResolved,
  });
}

describe('prefix reply payloads keep discord.js builders intact', () => {
  it('passes an EmbedBuilder through reply() as a real builder, not a plain clone', async () => {
    const { message, reply } = mockMessage();
    const embed = new EmbedBuilder().setTitle('Help').setDescription('Type +help in any channel.');

    await buildInteraction(message).reply({ embeds: [embed] } as never);

    expect(reply).toHaveBeenCalledTimes(1);
    const sent = reply.mock.calls[0][0] as { embeds: unknown[] };
    expect(sent.embeds[0]).toBeInstanceOf(EmbedBuilder);
    // The identity check is the point: a deep clone would produce an equal-looking object that is not a builder.
    expect(sent.embeds[0]).toBe(embed);
    expect((sent.embeds[0] as EmbedBuilder).toJSON().description).toBe('Type +help in any channel.');
  });

  it('passes an ActionRowBuilder through reply() so components serialize with their type field', async () => {
    const { message, reply } = mockMessage();
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('utility:help-select:user-1')
        .setPlaceholder('Choose a plugin')
        .addOptions({ label: 'Admin', value: 'admin' }),
    );

    await buildInteraction(message).reply({ components: [row] } as never);

    const sent = reply.mock.calls[0][0] as { components: unknown[] };
    expect(sent.components[0]).toBeInstanceOf(ActionRowBuilder);
    // `type` missing here is exactly what Discord rejected with TAG_FIELD_MISSING.
    expect((sent.components[0] as ActionRowBuilder).toJSON()).toHaveProperty('type');
  });

  it('still strips the ephemeral flag without damaging the builders alongside it', async () => {
    const { message, reply } = mockMessage();
    const embed = new EmbedBuilder().setDescription('nope');

    await buildInteraction(message).reply({ embeds: [embed], ephemeral: true } as never);

    const sent = reply.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('ephemeral');
    expect(sent.embeds).toEqual([embed]);
    expect((sent.embeds as unknown[])[0]).toBeInstanceOf(EmbedBuilder);
  });

  it('keeps builders intact through followUp() as well', async () => {
    const { message, send } = mockMessage();
    const embed = new EmbedBuilder().setDescription('follow up');
    const interaction = buildInteraction(message);

    await interaction.reply({ content: 'first' } as never);
    await interaction.followUp({ embeds: [embed] } as never);

    const sent = send.mock.calls[0][0] as { embeds: unknown[] };
    expect(sent.embeds[0]).toBeInstanceOf(EmbedBuilder);
  });
});
