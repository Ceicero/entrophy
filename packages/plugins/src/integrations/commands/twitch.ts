import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Prisma, type TwitchChatChannel, type TwitchChatLevel as PrismaTwitchChatLevel } from '@entrophy/database';
import {
  TWITCH_CHAT_LEVELS,
  TWITCH_CHAT_RESERVED_COMMAND_NAMES,
  type TwitchChatLevelId,
} from '@entrophy/types/integrations';
import {
  assertStaffLevel,
  brandEmbed,
  errorEmbed,
  listEmbed,
  registerConfirmHandlers,
  requestConfirmation,
  successEmbed,
  type ComponentHandler,
  type PluginCommand,
  type PluginContext,
} from '../../sdk';

// Per-channel limits + name/response/interval bounds mirror apps/api/src/lib/integrations/twitch-chat-schemas.ts
// exactly (this command can't import from apps/api — see that file's header comment).
const TWITCH_CHAT_NAME_PATTERN = /^[a-z0-9_]{1,32}$/;
const TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL = 50;
const TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL = 10;

const TWITCH_CHAT_LEVEL_LABEL: Record<TwitchChatLevelId, string> = {
  everyone: 'Everyone',
  subscriber: 'Subscriber',
  vip: 'VIP',
  moderator: 'Moderator',
  broadcaster: 'Broadcaster',
};

const TWITCH_CHAT_LEVEL_CHOICES = TWITCH_CHAT_LEVELS.map((id) => ({
  name: TWITCH_CHAT_LEVEL_LABEL[id],
  value: id,
}));

/** Input level id -> Prisma enum, for writes (mirrors routes/twitch-chat.ts's TWITCH_CHAT_LEVEL_ENUM_MAP). */
const TWITCH_CHAT_LEVEL_ENUM_MAP: Record<TwitchChatLevelId, PrismaTwitchChatLevel> = {
  everyone: 'EVERYONE',
  subscriber: 'SUBSCRIBER',
  vip: 'VIP',
  moderator: 'MODERATOR',
  broadcaster: 'BROADCASTER',
};

/** Reverse of the map above, for display (mirrors lib/integrations/dto.ts's TWITCH_CHAT_LEVEL_MAP). */
const TWITCH_CHAT_LEVEL_FROM_ENUM: Record<PrismaTwitchChatLevel, TwitchChatLevelId> = {
  EVERYONE: 'everyone',
  SUBSCRIBER: 'subscriber',
  VIP: 'vip',
  MODERATOR: 'moderator',
  BROADCASTER: 'broadcaster',
};

/** True for Prisma's unique-constraint-violation error (P2002) — same check as routes/twitch-chat.ts's isUniqueViolation. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function statusLabel(status: string): string {
  return (
    { CONNECTED: '🟢 Connected', DISCONNECTED: '⚪ Disconnected', ERROR: '🔴 Error', PENDING: '🟡 Pending' }[
      status
    ] ?? status
  );
}

/** Fire-and-forget: nudges the running `TwitchChatManager` to pick up a command/timer/channel change now instead
 * of waiting for the next `twitch-chat-tick` job (up to a minute later). Never blocks the command reply, and a
 * failure here is just logged — the next scheduled tick still catches up regardless. */
function nudgeReconcile(ctx: PluginContext): void {
  const service = ctx.services.get('twitchChat');
  if (!service) return;
  void service.reconcileNow().catch((err: unknown) => {
    ctx.logger.error({ err }, 'integrations/twitch: reconcile-after-command-change failed');
  });
}

const data = new SlashCommandBuilder()
  .setName('twitch')
  .setDescription("Manage Entrophy joining this server's Twitch chat.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName('status').setDescription('Show Twitch chat bot status for this server.'))
  .addSubcommand((sub) =>
    sub.setName('setup').setDescription('How to connect a Twitch channel from the dashboard.'),
  )
  .addSubcommand((sub) =>
    sub.setName('off').setDescription('Turn off Twitch chat for every linked channel here.'),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('command')
      .setDescription('Manage custom Twitch chat commands.')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a custom !command.')
          .addStringOption((opt) =>
            opt
              .setName('name')
              .setDescription('Command name (letters, numbers, underscore; no !)')
              .setRequired(true)
              .setMaxLength(32),
          )
          .addStringOption((opt) =>
            opt
              .setName('response')
              .setDescription('Reply text. Use {user} and {channel} as placeholders.')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(400),
          )
          .addIntegerOption((opt) =>
            opt
              .setName('cooldown')
              .setDescription('Cooldown in seconds (default 5)')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3600),
          )
          .addStringOption((opt) =>
            opt
              .setName('level')
              .setDescription('Minimum chat privilege required (default everyone)')
              .setRequired(false)
              .addChoices(...TWITCH_CHAT_LEVEL_CHOICES),
          )
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a custom command.')
          .addStringOption((opt) => opt.setName('name').setDescription('Command name').setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List custom commands.')
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('timer')
      .setDescription('Manage recurring auto-posted Twitch chat messages.')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a recurring timer message.')
          .addStringOption((opt) =>
            opt
              .setName('name')
              .setDescription('Timer name (letters, numbers, underscore)')
              .setRequired(true)
              .setMaxLength(32),
          )
          .addStringOption((opt) =>
            opt
              .setName('message')
              .setDescription('Message to post')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(400),
          )
          .addIntegerOption((opt) =>
            opt
              .setName('interval-minutes')
              .setDescription('How often to post, in minutes (5-1440)')
              .setRequired(true)
              .setMinValue(5)
              .setMaxValue(1440),
          )
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a timer.')
          .addStringOption((opt) => opt.setName('name').setDescription('Timer name').setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List timers.')
          .addStringOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Twitch channel (only needed if more than one is linked)')
              .setRequired(false)
              .setAutocomplete(true),
          ),
      ),
  );

type ChannelLookupResult = { ok: true; channel: TwitchChatChannel } | { ok: false; message: string };

/** Resolves the `channel` string option (a Twitch broadcaster login, NOT a Discord channel) against this guild's
 * linked `TwitchChatChannel` rows. The option may be omitted only when the guild has exactly one linked channel. */
async function resolveChannel(c: Parameters<PluginCommand['execute']>[0]): Promise<ChannelLookupResult> {
  const requested = c.interaction.options.getString('channel');
  const channels = await c.ctx.prisma.twitchChatChannel.findMany({ where: { guildId: c.guildId } });

  if (requested) {
    const normalized = requested.trim().toLowerCase();
    const match = channels.find((ch) => ch.broadcasterLogin.toLowerCase() === normalized);
    if (!match) return { ok: false, message: c.t('twitch.errors.channelNotFound', { channel: requested }) };
    return { ok: true, channel: match };
  }

  if (channels.length === 0) return { ok: false, message: c.t('twitch.errors.noChannels') };
  if (channels.length > 1) return { ok: false, message: c.t('twitch.errors.channelRequired') };
  return { ok: true, channel: channels[0]! };
}

async function disableAllTwitchChatChannels(ctx: PluginContext, guildId: string, actorId: string): Promise<void> {
  await ctx.prisma.twitchChatChannel.updateMany({ where: { guildId }, data: { enabled: false } });
  await ctx.audit({
    guildId,
    actorId,
    actorType: 'user',
    action: 'integration.twitch_chat.disable_all',
    targetType: 'twitch_chat_channel',
    source: 'bot',
  });
  nudgeReconcile(ctx);
}

async function deleteTwitchChatCommand(
  ctx: PluginContext,
  guildId: string,
  actorId: string,
  commandId: string,
  name: string,
): Promise<void> {
  await ctx.prisma.twitchChatCommand.delete({ where: { id: commandId } });
  await ctx.audit({
    guildId,
    actorId,
    actorType: 'user',
    action: 'integration.twitch_chat.command.delete',
    targetType: 'twitch_chat_command',
    targetId: commandId,
    before: { name },
    source: 'bot',
  });
  nudgeReconcile(ctx);
}

async function deleteTwitchChatTimer(
  ctx: PluginContext,
  guildId: string,
  actorId: string,
  timerId: string,
  name: string,
): Promise<void> {
  await ctx.prisma.twitchChatTimer.delete({ where: { id: timerId } });
  await ctx.audit({
    guildId,
    actorId,
    actorType: 'user',
    action: 'integration.twitch_chat.timer.delete',
    targetType: 'twitch_chat_timer',
    targetId: timerId,
    before: { name },
    source: 'bot',
  });
  nudgeReconcile(ctx);
}

async function handleStatus(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const [botIdentity, channels] = await Promise.all([
    c.ctx.prisma.twitchBotIdentity.findFirst(),
    c.ctx.prisma.twitchChatChannel.findMany({ where: { guildId: c.guildId }, orderBy: { createdAt: 'asc' } }),
  ]);

  const counts = await Promise.all(
    channels.map((channel) =>
      Promise.all([
        c.ctx.prisma.twitchChatCommand.count({ where: { channelId: channel.id } }),
        c.ctx.prisma.twitchChatTimer.count({ where: { channelId: channel.id } }),
      ]),
    ),
  );

  const runtime = c.ctx.services.get('twitchChat')?.status();

  const lines: string[] = [];
  lines.push(
    botIdentity
      ? c.t('twitch.status.botConfigured', { login: botIdentity.botLogin })
      : c.t('twitch.status.botNotConfigured'),
  );
  if (runtime) {
    lines.push(
      !runtime.enabled
        ? c.t('twitch.status.runtimeIdle', { reason: runtime.reason ?? 'Not configured.' })
        : runtime.connected
          ? c.t('twitch.status.runtimeConnected', { count: runtime.joinedChannels })
          : c.t('twitch.status.runtimeReconnecting', { reason: runtime.lastError ?? 'Reconnecting…' }),
    );
  }

  if (channels.length === 0) {
    lines.push(c.t('twitch.status.noChannels'));
  } else {
    channels.forEach((channel, i) => {
      const [commandCount, timerCount] = counts[i]!;
      lines.push(
        c.t('twitch.status.channelLine', {
          status: statusLabel(channel.status),
          login: channel.broadcasterLogin,
          prefix: channel.commandPrefix,
          commands: commandCount,
          timers: timerCount,
          disabled: channel.enabled ? '' : c.t('twitch.status.channelDisabledSuffix'),
        }),
      );
    });
  }

  await c.interaction.reply({ embeds: [listEmbed(c.t('twitch.status.title'), lines)], ephemeral: true });
}

async function handleSetup(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const botIdentity = await c.ctx.prisma.twitchBotIdentity.findFirst();
  const dashboardUrl = c.ctx.env.DASHBOARD_URL ?? 'the dashboard';
  const url = `${dashboardUrl}/dashboard/${c.guildId}/integrations`;

  const body =
    c.t('twitch.setup.instructions', { url }) +
    (botIdentity ? '' : c.t('twitch.setup.botNotConfiguredNote'));

  await c.interaction.reply({ embeds: [brandEmbed().setDescription(body)], ephemeral: true });
}

async function handleOff(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const channels = await c.ctx.prisma.twitchChatChannel.findMany({ where: { guildId: c.guildId } });
  if (channels.length === 0) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('twitch.off.noChannels'))], ephemeral: true });
    return;
  }

  const host = c.ctx.services.get('host');
  const guildConfig = host ? await host.getGuildConfig(c.guildId).catch(() => null) : null;

  const result = await requestConfirmation({
    interaction: c.interaction,
    ctx: c.ctx,
    pluginId: 'integrations',
    action: 'twitch-off',
    ownerId: c.interaction.user.id,
    embed: brandEmbed()
      .setTitle(c.t('twitch.off.confirmTitle'))
      .setDescription(c.t('twitch.off.confirmBody')),
    payload: {},
    fastActions: Boolean(guildConfig?.fastActions),
  });

  if (result.confirmed) {
    // `fastActions` short-circuited requestConfirmation without sending any reply — this is the first reply.
    await disableAllTwitchChatChannels(c.ctx, c.guildId, c.interaction.user.id);
    await c.interaction.reply({ embeds: [successEmbed(c.t('twitch.off.done'))], ephemeral: true });
  }
}

async function handleCommandAdd(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const name = c.interaction.options.getString('name', true).trim().toLowerCase();
  const response = c.interaction.options.getString('response', true).trim();
  const cooldownSeconds = c.interaction.options.getInteger('cooldown') ?? 5;
  const levelId = (c.interaction.options.getString('level') ?? 'everyone') as TwitchChatLevelId;

  if (!TWITCH_CHAT_NAME_PATTERN.test(name)) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('twitch.errors.invalidName'))], ephemeral: true });
    return;
  }
  if ((TWITCH_CHAT_RESERVED_COMMAND_NAMES as readonly string[]).includes(name)) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.reservedName', { name }))],
      ephemeral: true,
    });
    return;
  }
  if (response.length === 0) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('twitch.errors.emptyResponse'))], ephemeral: true });
    return;
  }

  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const clash = await c.ctx.prisma.twitchChatCommand.findUnique({
    where: { channelId_name: { channelId: channel.id, name } },
  });
  if (clash) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.commandExists', { name }))],
      ephemeral: true,
    });
    return;
  }

  const count = await c.ctx.prisma.twitchChatCommand.count({ where: { channelId: channel.id } });
  if (count >= TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.commandLimit', { max: TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL }))],
      ephemeral: true,
    });
    return;
  }

  // The checks above are a friendly fast path, not the real guarantee — the DB's unique constraint
  // (`@@unique([channelId, name])`) is the actual guard against a concurrent create for the same name
  // (precedent: routes/twitch-chat.ts's command create).
  let row;
  try {
    row = await c.ctx.prisma.twitchChatCommand.create({
      data: {
        channelId: channel.id,
        guildId: c.guildId,
        name,
        response,
        cooldownSeconds,
        minLevel: TWITCH_CHAT_LEVEL_ENUM_MAP[levelId],
        createdBy: c.interaction.user.id,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      await c.interaction.reply({
        embeds: [errorEmbed(c.t('twitch.errors.commandExists', { name }))],
        ephemeral: true,
      });
      return;
    }
    throw err;
  }

  await c.ctx.audit({
    guildId: c.guildId,
    actorId: c.interaction.user.id,
    actorType: 'user',
    action: 'integration.twitch_chat.command.create',
    targetType: 'twitch_chat_command',
    targetId: row.id,
    after: { channelId: channel.id, name: row.name },
    source: 'bot',
  });
  nudgeReconcile(c.ctx);

  await c.interaction.reply({
    embeds: [successEmbed(c.t('twitch.command.added', { name, channel: channel.broadcasterLogin }))],
    ephemeral: true,
  });
}

async function handleCommandRemove(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const name = c.interaction.options.getString('name', true).trim().toLowerCase();

  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const existing = await c.ctx.prisma.twitchChatCommand.findUnique({
    where: { channelId_name: { channelId: channel.id, name } },
  });
  if (!existing) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.commandNotFound', { name }))],
      ephemeral: true,
    });
    return;
  }

  const host = c.ctx.services.get('host');
  const guildConfig = host ? await host.getGuildConfig(c.guildId).catch(() => null) : null;

  const result = await requestConfirmation({
    interaction: c.interaction,
    ctx: c.ctx,
    pluginId: 'integrations',
    action: 'twitch-command-remove',
    ownerId: c.interaction.user.id,
    embed: brandEmbed()
      .setTitle(c.t('twitch.command.removeConfirmTitle', { name }))
      .setDescription(c.t('twitch.command.removeConfirmBody', { name, channel: channel.broadcasterLogin })),
    payload: { commandId: existing.id, name },
    fastActions: Boolean(guildConfig?.fastActions),
  });

  if (result.confirmed) {
    await deleteTwitchChatCommand(c.ctx, c.guildId, c.interaction.user.id, existing.id, name);
    await c.interaction.reply({ embeds: [successEmbed(c.t('twitch.command.removed', { name }))], ephemeral: true });
  }
}

async function handleCommandList(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const rows = await c.ctx.prisma.twitchChatCommand.findMany({
    where: { channelId: channel.id },
    orderBy: { name: 'asc' },
  });
  const lines = rows.map((row) =>
    c.t('twitch.command.listLine', {
      name: row.name,
      level: TWITCH_CHAT_LEVEL_LABEL[TWITCH_CHAT_LEVEL_FROM_ENUM[row.minLevel]],
      cooldown: row.cooldownSeconds,
      disabled: row.enabled ? '' : c.t('twitch.status.channelDisabledSuffix'),
      response: row.response,
    }),
  );

  await c.interaction.reply({
    embeds: [
      listEmbed(
        c.t('twitch.command.listTitle', { channel: channel.broadcasterLogin }),
        lines.length > 0 ? lines : [c.t('twitch.command.listEmpty')],
      ),
    ],
    ephemeral: true,
  });
}

async function handleTimerAdd(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const name = c.interaction.options.getString('name', true).trim().toLowerCase();
  const message = c.interaction.options.getString('message', true).trim();
  const intervalMinutes = c.interaction.options.getInteger('interval-minutes', true);

  if (!TWITCH_CHAT_NAME_PATTERN.test(name)) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('twitch.errors.invalidName'))], ephemeral: true });
    return;
  }
  if (message.length === 0) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('twitch.errors.emptyResponse'))], ephemeral: true });
    return;
  }

  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const clash = await c.ctx.prisma.twitchChatTimer.findUnique({
    where: { channelId_name: { channelId: channel.id, name } },
  });
  if (clash) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.timerExists', { name }))],
      ephemeral: true,
    });
    return;
  }

  const count = await c.ctx.prisma.twitchChatTimer.count({ where: { channelId: channel.id } });
  if (count >= TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.timerLimit', { max: TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL }))],
      ephemeral: true,
    });
    return;
  }

  let row;
  try {
    row = await c.ctx.prisma.twitchChatTimer.create({
      data: {
        channelId: channel.id,
        guildId: c.guildId,
        name,
        message,
        intervalMinutes,
        createdBy: c.interaction.user.id,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      await c.interaction.reply({
        embeds: [errorEmbed(c.t('twitch.errors.timerExists', { name }))],
        ephemeral: true,
      });
      return;
    }
    throw err;
  }

  await c.ctx.audit({
    guildId: c.guildId,
    actorId: c.interaction.user.id,
    actorType: 'user',
    action: 'integration.twitch_chat.timer.create',
    targetType: 'twitch_chat_timer',
    targetId: row.id,
    after: { channelId: channel.id, name: row.name },
    source: 'bot',
  });
  nudgeReconcile(c.ctx);

  await c.interaction.reply({
    embeds: [
      successEmbed(
        c.t('twitch.timer.added', { name, channel: channel.broadcasterLogin, interval: intervalMinutes }),
      ),
    ],
    ephemeral: true,
  });
}

async function handleTimerRemove(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const name = c.interaction.options.getString('name', true).trim().toLowerCase();

  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const existing = await c.ctx.prisma.twitchChatTimer.findUnique({
    where: { channelId_name: { channelId: channel.id, name } },
  });
  if (!existing) {
    await c.interaction.reply({
      embeds: [errorEmbed(c.t('twitch.errors.timerNotFound', { name }))],
      ephemeral: true,
    });
    return;
  }

  const host = c.ctx.services.get('host');
  const guildConfig = host ? await host.getGuildConfig(c.guildId).catch(() => null) : null;

  const result = await requestConfirmation({
    interaction: c.interaction,
    ctx: c.ctx,
    pluginId: 'integrations',
    action: 'twitch-timer-remove',
    ownerId: c.interaction.user.id,
    embed: brandEmbed()
      .setTitle(c.t('twitch.timer.removeConfirmTitle', { name }))
      .setDescription(c.t('twitch.timer.removeConfirmBody', { name, channel: channel.broadcasterLogin })),
    payload: { timerId: existing.id, name },
    fastActions: Boolean(guildConfig?.fastActions),
  });

  if (result.confirmed) {
    await deleteTwitchChatTimer(c.ctx, c.guildId, c.interaction.user.id, existing.id, name);
    await c.interaction.reply({ embeds: [successEmbed(c.t('twitch.timer.removed', { name }))], ephemeral: true });
  }
}

async function handleTimerList(c: Parameters<PluginCommand['execute']>[0]): Promise<void> {
  const resolved = await resolveChannel(c);
  if (!resolved.ok) {
    await c.interaction.reply({ embeds: [errorEmbed(resolved.message)], ephemeral: true });
    return;
  }
  const { channel } = resolved;

  const rows = await c.ctx.prisma.twitchChatTimer.findMany({
    where: { channelId: channel.id },
    orderBy: { name: 'asc' },
  });
  const lines = rows.map((row) =>
    c.t('twitch.timer.listLine', {
      name: row.name,
      interval: row.intervalMinutes,
      disabled: row.enabled ? '' : c.t('twitch.status.channelDisabledSuffix'),
      message: row.message,
    }),
  );

  await c.interaction.reply({
    embeds: [
      listEmbed(
        c.t('twitch.timer.listTitle', { channel: channel.broadcasterLogin }),
        lines.length > 0 ? lines : [c.t('twitch.timer.listEmpty')],
      ),
    ],
    ephemeral: true,
  });
}

export const command: PluginCommand = {
  data,
  requirement: {
    staffLevel: 'admin',
    guildOnly: true,
    discordPermissions: [PermissionFlagsBits.ManageGuild],
  },
  async execute(c) {
    assertStaffLevel(c.staffLevel, 'admin', c.t);
    const group = c.interaction.options.getSubcommandGroup(false);
    const sub = c.interaction.options.getSubcommand(true);

    if (!group) {
      if (sub === 'status') return handleStatus(c);
      if (sub === 'setup') return handleSetup(c);
      if (sub === 'off') return handleOff(c);
    }

    if (group === 'command') {
      if (sub === 'add') return handleCommandAdd(c);
      if (sub === 'remove') return handleCommandRemove(c);
      if (sub === 'list') return handleCommandList(c);
    }

    if (group === 'timer') {
      if (sub === 'add') return handleTimerAdd(c);
      if (sub === 'remove') return handleTimerRemove(c);
      if (sub === 'list') return handleTimerList(c);
    }
  },
  async autocomplete(c) {
    const focused = c.interaction.options.getFocused(true);
    if (focused.name === 'channel') {
      const query = String(focused.value).toLowerCase();
      const channels = await c.ctx.prisma.twitchChatChannel.findMany({
        where: { guildId: c.guildId },
        take: 25,
        orderBy: { createdAt: 'desc' },
      });
      const results = channels
        .filter((ch) => ch.broadcasterLogin.toLowerCase().includes(query))
        .slice(0, 25);
      await c.interaction.respond(
        results.map((ch) => ({ name: ch.broadcasterLogin.slice(0, 100), value: ch.broadcasterLogin })),
      );
      return;
    }

    await c.interaction.respond([]);
  },
};

/** Confirmation-flow button handlers for `/twitch off`, `/twitch command remove`, and `/twitch timer remove`
 * (destructive-action convention, ARCHITECTURE.md §7.7). */
export const twitchConfirmComponents: ComponentHandler[] = [
  ...registerConfirmHandlers<Record<string, never>>('twitch-off', async (c) => {
    await disableAllTwitchChatChannels(c.ctx, c.guildId, c.interaction.user.id);
    await c.interaction.followUp({ embeds: [successEmbed(c.t('twitch.off.done'))], ephemeral: true });
  }),
  ...registerConfirmHandlers<{ commandId: string; name: string }>('twitch-command-remove', async (c, payload) => {
    await deleteTwitchChatCommand(c.ctx, c.guildId, c.interaction.user.id, payload.commandId, payload.name);
    await c.interaction.followUp({
      embeds: [successEmbed(c.t('twitch.command.removed', { name: payload.name }))],
      ephemeral: true,
    });
  }),
  ...registerConfirmHandlers<{ timerId: string; name: string }>('twitch-timer-remove', async (c, payload) => {
    await deleteTwitchChatTimer(c.ctx, c.guildId, c.interaction.user.id, payload.timerId, payload.name);
    await c.interaction.followUp({
      embeds: [successEmbed(c.t('twitch.timer.removed', { name: payload.name }))],
      ephemeral: true,
    });
  }),
];
