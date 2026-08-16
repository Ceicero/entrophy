import { z } from 'zod';
import type { IntegrationConnection } from '@entrophy/database';
import type { PluginContext } from '../../sdk';
import { formatGithubEventEmbed, SUPPORTED_GITHUB_EVENTS } from '../formatters/github';
import { postAlert } from '../embeds';
import type { IntegrationProviderDef, InboundWebhookEvent } from './types';

/** Github has no per-connection concept — it's a plain `WebhookEndpoint` (INBOUND, provider `'github'`), so this
 * schema only documents the shape for completeness; it's never actually parsed against an `IntegrationConnection`. */
export const githubConfigSchema = z.object({});

interface GithubRepoFields {
  repository?: { full_name?: string };
  ref?: string;
  pull_request?: { base?: { ref?: string } };
}

/**
 * `WebhookEndpoint.events` doubles as both an event-type allowlist (`push`, `pull_request`, ...; empty = all
 * supported types) and optional `repo:<owner>/<name>` / `branch:<name>` filter entries — there's no dedicated
 * schema column for filters, and this endpoint's `events: String[]` is the one place they can live without a
 * database change.
 */
function parseFilters(events: string[]): {
  allowedTypes: Set<string>;
  repos: Set<string>;
  branches: Set<string>;
} {
  const allowedTypes = new Set<string>();
  const repos = new Set<string>();
  const branches = new Set<string>();
  for (const raw of events) {
    if (raw.startsWith('repo:')) repos.add(raw.slice('repo:'.length).toLowerCase());
    else if (raw.startsWith('branch:')) branches.add(raw.slice('branch:'.length));
    else allowedTypes.add(raw);
  }
  return { allowedTypes, repos, branches };
}

function branchOf(eventType: string, payload: GithubRepoFields): string | null {
  if (eventType === 'push') return payload.ref ? payload.ref.replace('refs/heads/', '') : null;
  if (eventType === 'pull_request') return payload.pull_request?.base?.ref ?? null;
  return null;
}

async function handleGithubInbound(
  ctx: PluginContext,
  _connection: IntegrationConnection | null,
  event: InboundWebhookEvent,
): Promise<void> {
  if (!event.endpointId) return;
  const endpoint = await ctx.prisma.webhookEndpoint.findUnique({ where: { id: event.endpointId } });
  if (!endpoint || !endpoint.enabled || endpoint.deletedAt) return;

  const { allowedTypes, repos, branches } = parseFilters(endpoint.events);
  if (allowedTypes.size > 0 && !allowedTypes.has(event.eventType)) return;
  if (!SUPPORTED_GITHUB_EVENTS.includes(event.eventType as (typeof SUPPORTED_GITHUB_EVENTS)[number])) return;

  const payload = event.payload as GithubRepoFields;
  if (repos.size > 0) {
    const repoName = payload.repository?.full_name?.toLowerCase();
    if (!repoName || !repos.has(repoName)) return;
  }
  if (branches.size > 0) {
    const branch = branchOf(event.eventType, payload);
    if (!branch || !branches.has(branch)) return;
  }

  const embed = formatGithubEventEmbed(event.eventType, event.payload);
  if (!embed || !endpoint.channelId) return;

  await postAlert(ctx, { guildId: endpoint.guildId, channelId: endpoint.channelId }, embed);
  await ctx.prisma.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: { lastDeliveryAt: new Date() },
  });
}

export const githubProvider: IntegrationProviderDef = {
  id: 'github',
  name: 'GitHub',
  kind: 'webhook',
  requiredEnv: [],
  configSchema: githubConfigSchema,
  handleInbound: handleGithubInbound,
};
