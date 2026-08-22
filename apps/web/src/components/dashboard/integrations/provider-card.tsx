'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@entrophy/ui';
import type {
  IntegrationConnectionDetailDto,
  IntegrationProviderInfoDto,
} from '@entrophy/types/integrations';

export interface ProviderCardProps {
  provider: IntegrationProviderInfoDto;
  watchCount?: number;
  onAddWatch?: () => void;
  /** The provider's OAuth-established connection, if any (from `useConnections`) — undefined for alert-only
   * providers (twitch/youtube/reddit/steam use per-target connections instead, see `onAddWatch`). */
  connection?: IntegrationConnectionDetailDto;
  onConnect?: () => void;
  onDisconnect?: () => void;
  connectPending?: boolean;
  disconnectPending?: boolean;
}

const KIND_LABEL: Record<IntegrationProviderInfoDto['kind'], string> = {
  oauth: 'OAuth',
  apikey: 'Server API key',
  public: 'Public API',
  webhook: 'Webhook',
};

export function ProviderCard({
  provider,
  watchCount,
  onAddWatch,
  connection,
  onConnect,
  onDisconnect,
  connectPending,
  disconnectPending,
}: ProviderCardProps) {
  const isConnected = connection?.status === 'connected';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{provider.name}</CardTitle>
        {provider.available ? (
          <Badge variant="success">Available</Badge>
        ) : (
          <Badge variant="secondary">Not configured</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {provider.available ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {KIND_LABEL[provider.kind]}
        </p>
        {!provider.available && provider.missingEnv.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            The operator needs to set: <span className="font-mono">{provider.missingEnv.join(', ')}</span>
          </p>
        ) : null}

        {provider.kind === 'oauth' && onConnect && onDisconnect ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            {isConnected ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Connected{connection?.externalAccountName ? ` as ${connection.externalAccountName}` : ''}
                </span>
                <Button size="sm" variant="ghost" onClick={onDisconnect} disabled={disconnectPending}>
                  {disconnectPending ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onConnect}
                disabled={!provider.available || connectPending}
              >
                {connectPending ? 'Starting…' : 'Connect'}
              </Button>
            )}
          </div>
        ) : null}

        {provider.supportsAlerts ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {watchCount ?? 0} watch{watchCount === 1 ? '' : 'es'}
            </span>
            <Button size="sm" variant="outline" onClick={onAddWatch} disabled={!provider.available}>
              Add watch
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
