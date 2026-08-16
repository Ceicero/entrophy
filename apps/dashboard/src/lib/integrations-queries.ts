'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@entrophy/types';
import type {
  CreateAlertConnectionInput,
  CreateOutboundEndpointInput,
  IntegrationConnectionDetailDto,
  IntegrationProviderInfoDto,
  WebhookDeliveryDto,
  WebhookEndpointDetailDto,
} from '@entrophy/types/integrations';
import { apiFetch, toQueryString } from './api';

export const integrationsQueryKeys = {
  connections: (guildId: string) => ['guilds', guildId, 'integrations', 'connections'] as const,
  providers: (guildId: string) => ['guilds', guildId, 'integrations', 'providers'] as const,
  alerts: (guildId: string, provider?: string) => ['guilds', guildId, 'integrations', 'alerts', provider ?? 'all'] as const,
  inboundWebhooks: (guildId: string) => ['guilds', guildId, 'integrations', 'webhooks', 'inbound'] as const,
  outboundWebhooks: (guildId: string) => ['guilds', guildId, 'integrations', 'webhooks', 'outbound'] as const,
  deliveries: (guildId: string, endpointId: string) => ['guilds', guildId, 'integrations', 'webhooks', 'outbound', endpointId, 'deliveries'] as const,
};

// ---------------------------------------------------------------------------
// Provider availability + OAuth/webhook-establishment connections
// ---------------------------------------------------------------------------

export function useIntegrationProviders(guildId: string | undefined) {
  return useQuery({
    queryKey: integrationsQueryKeys.providers(guildId ?? ''),
    queryFn: () => apiFetch<IntegrationProviderInfoDto[]>(`/guilds/${guildId}/integrations/providers`),
    enabled: Boolean(guildId),
  });
}

/** The base connection list (`GET /guilds/:id/integrations`) — every OAuth/webhook-established connection
 * (twitch/google_calendar/microsoft_calendar/notion/reddit/github/stripe/generic_webhook), distinct from the
 * per-target alert watches in `useAlertConnections`. Used to show "already connected" state on provider cards. */
export function useConnections(guildId: string | undefined) {
  return useQuery({
    queryKey: integrationsQueryKeys.connections(guildId ?? ''),
    queryFn: () => apiFetch<IntegrationConnectionDetailDto[]>(`/guilds/${guildId}/integrations`),
    enabled: Boolean(guildId),
  });
}

/** Maps a canonical provider id to the id `POST /:provider/connect` expects — that route predates the canonical
 * 10-id set and still uses its own shorthand for the two calendar providers. */
const CONNECT_ROUTE_PROVIDER_ID: Record<string, string> = { google_calendar: 'google', microsoft_calendar: 'microsoft' };

export interface ConnectProviderResult {
  /** Present for OAuth providers — redirect the browser here to start the flow. */
  url?: string;
  /** Present for webhook-establishing providers (github/generic_webhook/stripe). */
  webhookUrl?: string | null;
  secret?: string;
}

export function useConnectProvider(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) => apiFetch<ConnectProviderResult>(`/guilds/${guildId}/integrations/${CONNECT_ROUTE_PROVIDER_ID[providerId] ?? providerId}/connect`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.connections(guildId) });
    },
  });
}

export function useDisconnectConnection(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => apiFetch<void>(`/guilds/${guildId}/integrations/${connectionId}/disconnect`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.connections(guildId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Alert watches (twitch/youtube/reddit/steam)
// ---------------------------------------------------------------------------

export function useAlertConnections(guildId: string | undefined, provider?: string) {
  return useQuery({
    queryKey: integrationsQueryKeys.alerts(guildId ?? '', provider),
    queryFn: () => apiFetch<IntegrationConnectionDetailDto[]>(`/guilds/${guildId}/integrations/alerts${toQueryString({ provider })}`),
    enabled: Boolean(guildId),
  });
}

export function useCreateAlertConnection(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertConnectionInput) => apiFetch<IntegrationConnectionDetailDto>(`/guilds/${guildId}/integrations/alerts`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'integrations', 'alerts'] });
    },
  });
}

export function useDeleteAlertConnection(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => apiFetch<void>(`/guilds/${guildId}/integrations/alerts/${connectionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'integrations', 'alerts'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Inbound webhooks
// ---------------------------------------------------------------------------

export function useInboundWebhooks(guildId: string | undefined) {
  return useQuery({
    queryKey: integrationsQueryKeys.inboundWebhooks(guildId ?? ''),
    queryFn: () => apiFetch<WebhookEndpointDetailDto[]>(`/guilds/${guildId}/integrations/webhooks`),
    enabled: Boolean(guildId),
  });
}

export interface CreateInboundWebhookResult extends WebhookEndpointDetailDto {
  secret: string;
  url: string;
}

export interface CreateInboundWebhookInput {
  name: string;
  provider?: string;
  channelId?: string | null;
  events?: string[];
}

export function useCreateInboundWebhook(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInboundWebhookInput) => apiFetch<CreateInboundWebhookResult>(`/guilds/${guildId}/integrations/webhooks`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.inboundWebhooks(guildId) });
    },
  });
}

export function useDeleteInboundWebhook(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => apiFetch<void>(`/guilds/${guildId}/integrations/webhooks/${endpointId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.inboundWebhooks(guildId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Outbound webhooks
// ---------------------------------------------------------------------------

export function useOutboundWebhooks(guildId: string | undefined) {
  return useQuery({
    queryKey: integrationsQueryKeys.outboundWebhooks(guildId ?? ''),
    queryFn: () => apiFetch<WebhookEndpointDetailDto[]>(`/guilds/${guildId}/integrations/outbound`),
    enabled: Boolean(guildId),
  });
}

export interface CreateOutboundWebhookResult extends WebhookEndpointDetailDto {
  secret: string;
}

export function useCreateOutboundWebhook(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOutboundEndpointInput) => apiFetch<CreateOutboundWebhookResult>(`/guilds/${guildId}/integrations/outbound`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.outboundWebhooks(guildId) });
    },
  });
}

export function useDeleteOutboundWebhook(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => apiFetch<void>(`/guilds/${guildId}/integrations/outbound/${endpointId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.outboundWebhooks(guildId) });
    },
  });
}

export function useTestOutboundWebhook(guildId: string) {
  return useMutation({
    mutationFn: (endpointId: string) => apiFetch<{ queued: boolean }>(`/guilds/${guildId}/integrations/outbound/${endpointId}/test`, { method: 'POST' }),
  });
}

export function useOutboundDeliveries(guildId: string, endpointId: string | undefined) {
  return useQuery({
    queryKey: integrationsQueryKeys.deliveries(guildId, endpointId ?? ''),
    queryFn: () => apiFetch<Paginated<WebhookDeliveryDto>>(`/guilds/${guildId}/integrations/outbound/${endpointId}/deliveries`),
    enabled: Boolean(guildId && endpointId),
  });
}
