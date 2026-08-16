// DTO mappers owned by the `integrations` build stage — kept in `lib/integrations/` (this plugin's own lib
// subtree) rather than the shared `lib/dto.ts`, since the base `IntegrationConnectionDto`/`WebhookEndpointDto`
// mappers there already cover the fields every other route needs; these add the integrations-specific detail.
import type { IntegrationConnection, WebhookDelivery, WebhookEndpoint } from '@entrophy/database';
import type { IntegrationConnectionDetailDto, WebhookDeliveryDto, WebhookEndpointDetailDto } from '@entrophy/types/integrations';
import { toIntegrationConnectionDto, toWebhookEndpointDto } from '../dto';

export function toIntegrationConnectionDetailDto(row: IntegrationConnection): IntegrationConnectionDetailDto {
  const config = (row.config as Record<string, unknown> | null) ?? {};
  return {
    ...toIntegrationConnectionDto(row),
    label: row.label,
    target: typeof config.target === 'string' ? config.target : null,
    channelId: typeof config.channelId === 'string' ? config.channelId : null,
    roleId: typeof config.roleId === 'string' ? config.roleId : null,
    template: typeof config.template === 'string' ? config.template : null,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError,
  };
}

export function toWebhookEndpointDetailDto(row: WebhookEndpoint): WebhookEndpointDetailDto {
  return {
    ...toWebhookEndpointDto(row),
    name: row.name,
    events: row.events,
    channelId: row.channelId,
    failureCount: row.failureCount,
    lastDeliveryAt: row.lastDeliveryAt ? row.lastDeliveryAt.toISOString() : null,
  };
}

export function toWebhookDeliveryDto(row: WebhookDelivery): WebhookDeliveryDto {
  return {
    id: row.id,
    endpointId: row.endpointId,
    direction: row.direction === 'INBOUND' ? 'inbound' : 'outbound',
    status: row.status,
    success: row.success,
    attempt: row.attempt,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}
