// TwitchChatManager — the process-wide (one per bot process; see `../index.ts`'s module-level singleton
// instantiation) owner of the EventSub WebSocket connection and the reconcile loop that keeps its subscriptions
// matching every enabled `TwitchChatChannel` row whose guild has the `integrations` plugin enabled.
import type { TwitchChatChannel, TwitchChatCommand } from '@entrophy/database';
import type { PluginContext, TwitchChatRuntimeStatus, TwitchChatService } from '../../sdk';
import {
  EVENTSUB_WS_URL,
  EventSubSocket,
  defaultWebSocketConstructor,
  type EventSubNotification,
  type EventSubRevocation,
  type WebSocketConstructorLike,
} from './socket';
import {
  createChatSubscription,
  deleteEventSubSubscription,
  getBotIdentityRow,
  getChannelInfo,
  getStream,
  pruneSendThrottle,
  sendChatMessage,
} from './helix';
import { CommandCooldowns, handleChatMessage } from './engine';

/** One WebSocket session supports up to 300 zero-cost EventSub subscriptions (SPEC.md). */
const MAX_CHANNELS = 300;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
/** Twitch's own idle-socket message. Shown to the operator instead of Twitch's raw wording. */
const NO_CHANNELS_IDLE_REASON = 'no linked Twitch channels yet';

interface SubscriptionEntry {
  subscriptionId: string;
  broadcasterUserId: string;
}

interface ChannelCacheEntry {
  channel: TwitchChatChannel;
  commands: TwitchChatCommand[];
}

/** The subset of a `channel.chat.message` v1 notification event this manager reads. Field names are Twitch's own
 * (snake_case), matching every other Helix/EventSub payload type in this plugin. */
interface RawChatMessageEvent {
  broadcaster_user_id: string;
  chatter_user_id: string;
  chatter_user_name: string;
  message?: { text?: string };
  badges?: { set_id: string }[];
}

export class TwitchChatManager {
  private socket: EventSubSocket | null = null;
  private previousSocket: EventSubSocket | null = null;
  private sessionId: string | null = null;
  private connected = false;
  private stopped = true;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while `tryConnect` is between its first await and either opening a socket or giving up — lets
   * `reconcile` avoid firing a second, parallel connect attempt while one is already mid-flight. */
  private connecting = false;
  private lastError: string | null = null;
  private envConfigured = false;
  private botConfigured = false;
  /** Whether the last desired-set check found at least one channel to serve. Idle (and reported `enabled: false`)
   * whenever this is `false`, even though env + bot identity are both otherwise fine — there's simply nothing to
   * connect for yet. */
  private channelsAvailable = false;
  private idleReason: string | null = null;
  private botUserId: string | null = null;

  /** Coalesces overlapping `reconcile()` calls (minute tick, post-welcome, `reconcileNow` nudges) into a single
   * run at a time: a caller arriving while a run is already active reuses that same in-flight promise instead of
   * starting its own pass (which is what let concurrent callers race `createChatSubscription` for the same
   * channel). `reconcileQueued` records that at least one more pass is owed once the current one finishes, so
   * whatever prompted the overlapping call is still guaranteed to be picked up. */
  private reconcileInFlight: Promise<void> | null = null;
  private reconcileQueued = false;

  private readonly cooldowns = new CommandCooldowns();
  private readonly subscriptionByChannelId = new Map<string, SubscriptionEntry>();
  private readonly channelIdByBroadcasterId = new Map<string, string>();
  private readonly channelCache = new Map<string, ChannelCacheEntry>();

  constructor(private readonly wsCtor: WebSocketConstructorLike = defaultWebSocketConstructor) {}

  /** Attempts an initial connection; never throws — a missing env/bot-identity/linked-channel just leaves the
   * manager idle with a reason `status()` reports, and every later `reconcile(ctx)` tick retries (so completing
   * owner setup or linking the first channel later, with no bot restart, brings the manager up on its own). Must
   * not be awaited by `onLoad` — this resolves once the *attempt* finishes, not once the socket is actually
   * connected. */
  async start(ctx: PluginContext): Promise<void> {
    this.stopped = false;
    await this.tryConnect(ctx);
  }

  /** Closes the socket (and any in-flight reconnect-follow socket) and stops scheduling reconnects. Safe to call
   * even if never successfully connected. Does not clear channel/command cache — `start()` can be called again
   * later (not currently done anywhere, but keeps the class honest about what "stop" means). */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.previousSocket?.close();
    this.previousSocket = null;
    this.connected = false;
    this.sessionId = null;
  }

  /** Channel ids the manager currently has a live EventSub subscription for — `timers.ts` only fires a timer
   * message into a channel we're actually connected to. */
  connectedChannelIds(): string[] {
    return [...this.subscriptionByChannelId.keys()];
  }

  status(): TwitchChatRuntimeStatus {
    if (!this.envConfigured || !this.botConfigured || !this.channelsAvailable) {
      return {
        enabled: false,
        reason: this.idleReason ?? 'Twitch chat is not configured on this deployment.',
        connected: false,
        sessionId: null,
        joinedChannels: 0,
        lastError: this.lastError,
      };
    }
    return {
      enabled: true,
      reason: this.connected ? undefined : (this.lastError ?? 'Reconnecting to Twitch EventSub…'),
      connected: this.connected,
      sessionId: this.sessionId,
      joinedChannels: this.subscriptionByChannelId.size,
      lastError: this.lastError,
    };
  }

  /** Every enabled `TwitchChatChannel` row whose guild currently has the `integrations` plugin enabled
   * (`ctx.isEnabled`, same per-guild-enablement contract every other plugin job uses — e.g.
   * `community/jobs/stats-refresh.ts`), uncapped. Shared by `tryConnect` (which only needs to know whether this
   * is empty, to decide whether opening a socket is even worthwhile) and `reconcile` (which needs the full list
   * to diff against). */
  private async computeDesiredChannels(ctx: PluginContext): Promise<TwitchChatChannel[]> {
    const rows = await ctx.prisma.twitchChatChannel.findMany({ where: { enabled: true } });
    const desired: TwitchChatChannel[] = [];
    for (const row of rows) {
      if (await ctx.isEnabled(row.guildId)) desired.push(row);
    }
    return desired;
  }

  /**
   * Reconciles desired vs. actual EventSub subscriptions. Safe to call even when idle/disconnected (no-ops until
   * a session exists) — called every minute from the `twitch-chat-tick` job, on every `session_welcome`, and on
   * an owner-action `reconcileNow` nudge, which is also how the manager notices it can come out of idle
   * (env/bot-identity/first-channel configured later) or needs to be nudged back online, without a bot restart.
   *
   * Overlapping calls are coalesced (see `reconcileInFlight`/`reconcileQueued`) rather than each running its own
   * independent pass — the old direct-recursion approach let two callers race `createChatSubscription` for the
   * same channel, producing duplicate subscriptions, orphaned subscription ids, and false `ERROR` statuses on
   * channels that were actually working fine.
   */
  async reconcile(ctx: PluginContext): Promise<void> {
    if (this.reconcileInFlight) {
      this.reconcileQueued = true;
      return this.reconcileInFlight;
    }
    this.reconcileInFlight = this.runReconcileLoop(ctx);
    return this.reconcileInFlight;
  }

  private async runReconcileLoop(ctx: PluginContext): Promise<void> {
    try {
      do {
        this.reconcileQueued = false;
        await this.runReconcileOnce(ctx);
      } while (this.reconcileQueued);
    } finally {
      this.reconcileInFlight = null;
    }
  }

  private async runReconcileOnce(ctx: PluginContext): Promise<void> {
    if (!this.socket && !this.stopped && !this.connecting && this.reconnectTimer === null) {
      await this.tryConnect(ctx).catch((err: unknown) => {
        ctx.logger.error({ err }, 'integrations/twitch-chat: connect attempt failed');
      });
    }
    if (!this.sessionId) return; // idle, mid-handshake, or mid-backoff — nothing to reconcile against right now

    // The bot identity can disappear (owner disconnected it) or turn ERROR (a terminal refresh failure) while
    // we're happily connected — neither is caught by anything else once the socket is already up, since
    // `tryConnect` only runs before a session exists. Re-check it on every pass instead.
    const identity = await getBotIdentityRow(ctx).catch(() => null);
    if (!identity || identity.status === 'ERROR') {
      this.botConfigured = false;
      this.idleReason = !identity
        ? "Entrophy's Twitch bot account has not been connected yet (owner setup pending)."
        : 'Twitch bot identity needs to be reconnected (owner re-auth required).';
      this.closeSocketAndGoIdle();
      return;
    }

    const desired = await this.computeDesiredChannels(ctx);
    if (desired.length > MAX_CHANNELS) {
      ctx.logger.warn(
        { count: desired.length, max: MAX_CHANNELS },
        'integrations/twitch-chat: more linked channels than the EventSub session cap; the excess are left unsubscribed',
      );
    }
    const capped = desired.slice(0, MAX_CHANNELS);
    this.channelsAvailable = capped.length > 0;
    const desiredIds = new Set(capped.map((c) => c.id));

    for (const [channelId, sub] of [...this.subscriptionByChannelId.entries()]) {
      if (desiredIds.has(channelId)) continue;
      await deleteEventSubSubscription(ctx, sub.subscriptionId).catch(() => undefined);
      this.forgetChannel(channelId, sub.broadcasterUserId);
    }

    if (capped.length === 0) {
      // The desired set just went to zero while we were connected — every subscription was already removed by
      // the loop above. Rather than leave a live, zero-subscription EventSub session running (which Twitch may
      // kill on its own anyway), close it proactively and go idle; the next tick reconnects the moment a channel
      // reappears.
      this.idleReason = NO_CHANNELS_IDLE_REASON;
      this.closeSocketAndGoIdle();
      return;
    }

    for (const channel of capped) {
      if (this.subscriptionByChannelId.has(channel.id)) {
        await this.refreshChannelCache(ctx, channel);
        continue;
      }

      const sessionId = this.sessionId;
      if (!sessionId) break; // socket died partway through this loop; the next tick picks up where we left off

      const result = await createChatSubscription(ctx, sessionId, channel.broadcasterUserId);
      if (result.ok) {
        this.subscriptionByChannelId.set(channel.id, {
          subscriptionId: result.subscriptionId,
          broadcasterUserId: channel.broadcasterUserId,
        });
        this.channelIdByBroadcasterId.set(channel.broadcasterUserId, channel.id);
        await this.refreshChannelCache(ctx, channel);
        await ctx.prisma.twitchChatChannel
          .update({
            where: { id: channel.id },
            data: { status: 'CONNECTED', lastError: null, lastConnectedAt: new Date() },
          })
          .catch(() => undefined);
      } else {
        await ctx.prisma.twitchChatChannel
          .update({ where: { id: channel.id }, data: { status: 'ERROR', lastError: result.error.slice(0, 500) } })
          .catch(() => undefined);
      }
    }
  }

  private async refreshChannelCache(ctx: PluginContext, channel: TwitchChatChannel): Promise<void> {
    const commands = await ctx.prisma.twitchChatCommand.findMany({
      where: { channelId: channel.id, enabled: true },
    });
    this.channelCache.set(channel.id, { channel, commands });
  }

  /** Stops tracking one channel: drops its subscription entry, its broadcaster-id reverse lookup, its cached
   * commands, and (fix for the module-level maps otherwise growing forever) its `CommandCooldowns` entries and
   * its Helix send-throttle entry. Called for every removal path — reconcile's own stale-subscription cleanup,
   * an EventSub revocation, and a full-session reset (`closeSocketAndGoIdle`, or a brand-new `session_welcome`
   * that isn't a reconnect-follow). */
  private forgetChannel(channelId: string, broadcasterUserId: string): void {
    this.subscriptionByChannelId.delete(channelId);
    this.channelIdByBroadcasterId.delete(broadcasterUserId);
    this.channelCache.delete(channelId);
    this.cooldowns.pruneChannel(channelId);
    pruneSendThrottle(broadcasterUserId);
  }

  /** Closes the current (and any retiring) socket without going through the normal `onClosed`→backoff path —
   * used when the manager itself decides to go idle (desired set emptied, or the bot identity disappeared/went
   * ERROR) rather than the socket dying on its own. Clears every bit of live-session state, including whatever
   * subscriptions are still tracked (normally already empty by the time this runs, since both call sites clear
   * them first, but harmless either way). */
  private closeSocketAndGoIdle(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close(); // suppressed onClosed — we're handling this transition ourselves, not reconnecting
    this.socket = null;
    this.previousSocket?.close();
    this.previousSocket = null;
    this.connected = false;
    this.sessionId = null;
    this.backoffMs = INITIAL_BACKOFF_MS;
    for (const [channelId, sub] of [...this.subscriptionByChannelId.entries()]) {
      this.forgetChannel(channelId, sub.broadcasterUserId);
    }
  }

  private async tryConnect(ctx: PluginContext): Promise<void> {
    if (this.stopped || this.socket || this.connecting) return;
    this.connecting = true;
    try {
      const clientId = ctx.env.TWITCH_CLIENT_ID;
      const clientSecret = ctx.env.TWITCH_CLIENT_SECRET;
      this.envConfigured = Boolean(clientId && clientSecret);
      if (!this.envConfigured) {
        this.idleReason = 'TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are not configured on this deployment.';
        return;
      }

      const identity = await getBotIdentityRow(ctx).catch(() => null);
      if (this.stopped || this.socket) return; // stop()/another connect raced us while we were awaiting
      this.botConfigured = Boolean(identity);
      if (!identity) {
        this.idleReason = "Entrophy's Twitch bot account has not been connected yet (owner setup pending).";
        return;
      }

      const desired = await this.computeDesiredChannels(ctx);
      if (this.stopped || this.socket) return; // same race guard after the second await
      this.channelsAvailable = desired.length > 0;
      if (!this.channelsAvailable) {
        // Opening a socket with nothing to subscribe is worse than not opening one at all: Twitch closes an
        // EventSub session that creates no subscription within 10s of welcome (code 4003), and the resulting
        // reconnect resets backoff — a deployment with zero linked channels would otherwise reconnect forever,
        // every ~11s. Every reconcile tick re-checks this and connects the moment a channel is linked.
        this.idleReason = NO_CHANNELS_IDLE_REASON;
        return;
      }

      this.idleReason = null;
      this.botUserId = identity.botUserId;
      this.connectSocket(ctx, EVENTSUB_WS_URL, { isReconnectFollow: false });
    } finally {
      this.connecting = false;
    }
  }

  private connectSocket(ctx: PluginContext, url: string, opts: { isReconnectFollow: boolean }): void {
    const socket: EventSubSocket = new EventSubSocket(
      url,
      {
        onWelcome: (sessionId) => {
          if (this.socket !== socket) return; // superseded before it even welcomed (e.g. stop() raced this)
          this.sessionId = sessionId;
          this.connected = true;
          this.lastError = null;
          this.backoffMs = INITIAL_BACKOFF_MS;

          if (this.previousSocket) {
            this.previousSocket.close();
            this.previousSocket = null;
          }
          if (!opts.isReconnectFollow) {
            // A brand-new session invalidates every previous subscription — they die with the old session and
            // must be recreated. A `session_reconnect`-follow session instead carries them over automatically.
            for (const [channelId, sub] of [...this.subscriptionByChannelId.entries()]) {
              this.forgetChannel(channelId, sub.broadcasterUserId);
            }
          }
          void this.reconcile(ctx).catch((err: unknown) => {
            ctx.logger.error({ err }, 'integrations/twitch-chat: post-welcome reconcile failed');
          });
        },
        onReconnect: (reconnectUrl) => {
          if (this.socket !== socket) return;
          this.previousSocket = socket;
          this.connectSocket(ctx, reconnectUrl, { isReconnectFollow: true });
        },
        onNotification: (message) => {
          if (this.socket !== socket && this.previousSocket !== socket) return;
          void this.handleNotification(ctx, message);
        },
        onRevocation: (message) => {
          if (this.socket !== socket) return;
          void this.handleRevocation(ctx, message);
        },
        onClosed: (reason) => {
          if (this.socket !== socket) return; // a stale/already-superseded socket dying isn't "the" socket dying
          this.socket = null;
          this.connected = false;
          this.sessionId = null;
          this.lastError = reason;
          if (!this.stopped) this.scheduleReconnect(ctx);
        },
      },
      this.wsCtor,
    );
    this.socket = socket;
  }

  private scheduleReconnect(ctx: PluginContext): void {
    if (this.stopped || this.reconnectTimer) return;
    const jitterMs = Math.floor(Math.random() * Math.min(1000, this.backoffMs));
    const delayMs = this.backoffMs + jitterMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.tryConnect(ctx).catch((err: unknown) => {
        ctx.logger.error({ err }, 'integrations/twitch-chat: reconnect attempt failed');
      });
    }, delayMs);
  }

  private async handleNotification(ctx: PluginContext, message: EventSubNotification): Promise<void> {
    try {
      if (message.subscription.type !== 'channel.chat.message') return;
      const event = message.event as RawChatMessageEvent;
      const channelId = this.channelIdByBroadcasterId.get(event.broadcaster_user_id);
      if (!channelId) return;
      const cached = this.channelCache.get(channelId);
      if (!cached) return;

      const reply = await handleChatMessage({
        botUserId: this.botUserId ?? '',
        channel: {
          id: cached.channel.id,
          commandPrefix: cached.channel.commandPrefix,
          broadcasterLogin: cached.channel.broadcasterLogin,
          broadcasterUserId: cached.channel.broadcasterUserId,
        },
        commands: cached.commands,
        event: {
          chatterUserId: event.chatter_user_id,
          chatterDisplayName: event.chatter_user_name,
          messageText: event.message?.text ?? '',
          badgeSetIds: (event.badges ?? []).map((b) => b.set_id),
        },
        cooldowns: this.cooldowns,
        helix: {
          getStream: (id) => getStream(ctx, id),
          getChannelInfo: (id) => getChannelInfo(ctx, id),
        },
      });

      if (reply) {
        await sendChatMessage(ctx, cached.channel.broadcasterUserId, reply);
      }
    } catch (err) {
      // A single bad/unexpected message must never kill the socket loop.
      ctx.logger.error({ err }, 'integrations/twitch-chat: notification handler threw');
    }
  }

  private async handleRevocation(ctx: PluginContext, message: EventSubRevocation): Promise<void> {
    try {
      const entry = [...this.subscriptionByChannelId.entries()].find(
        ([, sub]) => sub.subscriptionId === message.subscription.id,
      );
      if (!entry) return;
      const [channelId, sub] = entry;
      this.forgetChannel(channelId, sub.broadcasterUserId);
      await ctx.prisma.twitchChatChannel
        .update({
          where: { id: channelId },
          data: {
            status: 'ERROR',
            lastError: `Twitch revoked the chat subscription (${message.subscription.status}). Reconnect the channel from the dashboard.`,
          },
        })
        .catch(() => undefined);
    } catch (err) {
      ctx.logger.error({ err }, 'integrations/twitch-chat: revocation handler threw');
    }
  }
}

/** Builds the `ServiceMap.twitchChat` implementation, closing over the already-built `ctx` (same pattern as
 * `createIntegrationsService`) so the parameterless `ServiceMap` methods still have a context to work with. */
export function createTwitchChatService(ctx: PluginContext, manager: TwitchChatManager): TwitchChatService {
  return {
    status: () => manager.status(),
    reconcileNow: () => manager.reconcile(ctx),
    stop: () => manager.stop(),
  };
}
