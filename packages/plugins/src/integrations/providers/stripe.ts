import { z } from 'zod';
import type { IntegrationConnection } from '@entrophy/database';
import type { PluginContext } from '../../sdk';
import type { IntegrationProviderDef, InboundWebhookEvent } from './types';

export const stripeRewardRuleSchema = z.object({ priceId: z.string().min(1), roleId: z.string().regex(/^\d{17,20}$/) });
export const stripeConfigSchema = z.object({
  rewards: z.array(stripeRewardRuleSchema).default([]),
});
export type StripeRewardRule = z.infer<typeof stripeRewardRuleSchema>;

export interface StripeEventLike {
  type?: string;
  data?: { object?: Record<string, unknown> };
}

export interface ResolvedStripeReward {
  guildId: string | null;
  discordUserId: string;
  priceId: string;
  roleId: string;
  action: 'add' | 'remove';
}

function readMetadataField(obj: Record<string, unknown> | undefined, field: string): string | undefined {
  const metadata = obj?.metadata as Record<string, unknown> | undefined;
  const value = metadata?.[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstPriceId(items: unknown): string | undefined {
  if (!items || typeof items !== 'object' || !('data' in items)) return undefined;
  const data = (items as { data?: unknown[] }).data;
  const first = Array.isArray(data) ? data[0] : undefined;
  const price = first && typeof first === 'object' ? (first as { price?: { id?: string } }).price : undefined;
  return price?.id;
}

/**
 * Pure mapping from a Stripe event to a role-reward action, given the guild's configured `rewards` rules
 * (ARCHITECTURE.md's integrations connector spec: "map checkout.session.completed / invoice.paid /
 * customer.subscription.deleted to role rewards by priceId"). Returns `null` when the event type isn't one of
 * the three handled, the Discord user id is missing, or the price id doesn't match a configured rule.
 */
export function resolveStripeRoleReward(event: StripeEventLike, rewards: StripeRewardRule[]): ResolvedStripeReward | null {
  const object = event.data?.object;
  if (!object) return null;

  let discordUserId: string | undefined;
  let priceId: string | undefined;
  let action: 'add' | 'remove';
  let guildId: string | null = null;

  if (event.type === 'checkout.session.completed') {
    discordUserId = typeof object.client_reference_id === 'string' ? object.client_reference_id : readMetadataField(object, 'discord_user_id');
    priceId = readMetadataField(object, 'priceId');
    guildId = readMetadataField(object, 'guildId') ?? null;
    action = 'add';
  } else if (event.type === 'invoice.paid') {
    discordUserId = readMetadataField(object, 'discord_user_id');
    priceId = firstPriceId(object.lines);
    guildId = readMetadataField(object, 'guildId') ?? null;
    action = 'add';
  } else if (event.type === 'customer.subscription.deleted') {
    discordUserId = readMetadataField(object, 'discord_user_id');
    priceId = firstPriceId(object.items);
    guildId = readMetadataField(object, 'guildId') ?? null;
    action = 'remove';
  } else {
    return null;
  }

  if (!discordUserId || !priceId) return null;
  const rule = rewards.find((r) => r.priceId === priceId);
  if (!rule) return null;

  return { guildId, discordUserId, priceId, roleId: rule.roleId, action };
}

async function applyRoleReward(ctx: PluginContext, guildId: string, discordUserId: string, roleId: string, action: 'add' | 'remove'): Promise<void> {
  try {
    const guild = await ctx.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;
    if (action === 'add') await member.roles.add(roleId, 'Stripe role reward');
    else await member.roles.remove(roleId, 'Stripe role reward revoked');
  } catch (err) {
    ctx.logger.warn({ err, guildId, discordUserId, roleId, action }, 'integrations/stripe: failed to apply role reward');
  }
}

/** Stripe events arrive at one shared endpoint (no per-guild endpointId) — the guild is recovered from
 * `metadata.guildId`, which whoever creates the Checkout Session / subscription for role rewards must set. */
async function handleStripeInbound(ctx: PluginContext, _connection: IntegrationConnection | null, event: InboundWebhookEvent): Promise<void> {
  const stripeEvent = event.payload as StripeEventLike;
  const guildIdFromEvent = (stripeEvent.data?.object?.metadata as Record<string, unknown> | undefined)?.guildId;
  const candidateGuildIds: string[] = [];
  if (typeof guildIdFromEvent === 'string') candidateGuildIds.push(guildIdFromEvent);

  // Fall back to scanning this guild's own connection config if metadata didn't carry the guild id directly —
  // still bounded (only STRIPE connections), and only reached when the checkout/subscription metadata omitted it.
  const connections = candidateGuildIds.length > 0
    ? await ctx.prisma.integrationConnection.findMany({ where: { provider: 'STRIPE', guildId: { in: candidateGuildIds }, deletedAt: null } })
    : await ctx.prisma.integrationConnection.findMany({ where: { provider: 'STRIPE', deletedAt: null } });

  for (const connection of connections) {
    const raw = (connection.config as Record<string, unknown> | null) ?? {};
    const rewards = stripeConfigSchema.parse(raw).rewards;
    const resolved = resolveStripeRoleReward(stripeEvent, rewards);
    if (!resolved) continue;
    await applyRoleReward(ctx, connection.guildId, resolved.discordUserId, resolved.roleId, resolved.action);
    await ctx.prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: null } }).catch(() => undefined);
  }
}

export const stripeProvider: IntegrationProviderDef = {
  id: 'stripe',
  name: 'Stripe',
  kind: 'webhook',
  requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  configSchema: stripeConfigSchema,
  handleInbound: handleStripeInbound,
};
