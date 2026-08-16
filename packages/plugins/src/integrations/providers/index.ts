import type { IntegrationProvider as PrismaIntegrationProvider } from '@entrophy/database';
import { INTEGRATION_PROVIDER_IDS, type IntegrationProviderId, type IntegrationProviderInfoDto } from '@entrophy/types/integrations';
import { githubProvider } from './github';
import { genericWebhookProvider } from './generic-webhook';
import { googleCalendarProvider } from './google-calendar';
import { microsoftCalendarProvider } from './microsoft-calendar';
import { notionProvider } from './notion';
import { redditProvider } from './reddit';
import { steamProvider } from './steam';
import { stripeProvider } from './stripe';
import { twitchProvider } from './twitch';
import { youtubeProvider } from './youtube';
import { isProviderEnvSatisfied, type IntegrationProviderDef } from './types';

const REGISTRY: Record<IntegrationProviderId, IntegrationProviderDef> = {
  twitch: twitchProvider,
  youtube: youtubeProvider,
  github: githubProvider,
  reddit: redditProvider,
  steam: steamProvider,
  google_calendar: googleCalendarProvider,
  microsoft_calendar: microsoftCalendarProvider,
  notion: notionProvider,
  stripe: stripeProvider,
  generic_webhook: genericWebhookProvider,
};

/** Maps our lowercase provider id to Prisma's `IntegrationProvider` enum value. */
export const PROVIDER_ENUM_MAP: Record<IntegrationProviderId, PrismaIntegrationProvider> = {
  twitch: 'TWITCH',
  youtube: 'YOUTUBE',
  github: 'GITHUB',
  reddit: 'REDDIT',
  steam: 'STEAM',
  google_calendar: 'GOOGLE_CALENDAR',
  microsoft_calendar: 'MICROSOFT_CALENDAR',
  notion: 'NOTION',
  stripe: 'STRIPE',
  generic_webhook: 'GENERIC_WEBHOOK',
};

// OPENAI/ANTHROPIC are the `ai` plugin's own connector kinds (SPEC.md §K) — the `IntegrationProvider` Prisma
// enum is shared, but this plugin never creates or reads connections of those two values, hence `Partial`.
const ENUM_TO_PROVIDER_ID: Partial<Record<PrismaIntegrationProvider, IntegrationProviderId>> = {
  TWITCH: 'twitch',
  YOUTUBE: 'youtube',
  GITHUB: 'github',
  REDDIT: 'reddit',
  STEAM: 'steam',
  GOOGLE_CALENDAR: 'google_calendar',
  MICROSOFT_CALENDAR: 'microsoft_calendar',
  NOTION: 'notion',
  STRIPE: 'stripe',
  GENERIC_WEBHOOK: 'generic_webhook',
};

/** `undefined` for enum values this plugin doesn't own (OPENAI/ANTHROPIC — the `ai` plugin's connectors). */
export function providerIdFromEnum(value: PrismaIntegrationProvider): IntegrationProviderId | undefined {
  return ENUM_TO_PROVIDER_ID[value];
}

/** Returns the connector definition for `id`, or `undefined` for an unknown/unsupported id. */
export function getProvider(id: string): IntegrationProviderDef | undefined {
  return REGISTRY[id as IntegrationProviderId];
}

export function listProviderDefs(): IntegrationProviderDef[] {
  return INTEGRATION_PROVIDER_IDS.map((id) => REGISTRY[id]);
}

/** Per-provider availability (ARCHITECTURE.md's integrations connector spec: "clear setup page and connection status"). */
export function listProviderAvailability(env: Record<string, unknown>): IntegrationProviderInfoDto[] {
  return listProviderDefs().map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.kind,
    available: isProviderEnvSatisfied(def.requiredEnv, env),
    missingEnv: def.requiredEnv.filter((key) => !env[key]),
    supportsAlerts: def.poll !== undefined && def.kind !== 'webhook',
  }));
}

export * from './types';
