'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@entrophy/ui';
import type { AlertProviderId, IntegrationConnectionDetailDto } from '@entrophy/types/integrations';
import {
  useAlertConnections,
  useConnectProvider,
  useConnections,
  useDisconnectConnection,
  useIntegrationProviders,
  type CreateInboundWebhookResult,
  type CreateOutboundWebhookResult,
} from '@/lib/dashboard/integrations-queries';
import { ApiClientError } from '@/lib/dashboard/api';
import { ErrorState } from '@/components/dashboard/error-state';
import { AlertFormDialog } from '@/components/dashboard/integrations/alert-form-dialog';
import { AlertsList } from '@/components/dashboard/integrations/alerts-list';
import { ProviderCard } from '@/components/dashboard/integrations/provider-card';
import { InboundWebhookDialog } from '@/components/dashboard/integrations/inbound-webhook-dialog';
import { InboundWebhooksList } from '@/components/dashboard/integrations/inbound-webhooks-list';
import { OutboundWebhookDialog } from '@/components/dashboard/integrations/outbound-webhook-dialog';
import { OutboundWebhooksList } from '@/components/dashboard/integrations/outbound-webhooks-list';
import { SecretRevealDialog } from '@/components/dashboard/integrations/secret-reveal-dialog';

export default function IntegrationsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const providersQuery = useIntegrationProviders(guildId);
  const alertsQuery = useAlertConnections(guildId);
  const connectionsQuery = useConnections(guildId);
  const connectProvider = useConnectProvider(guildId);
  const disconnectConnection = useDisconnectConnection(guildId);
  const { toast } = useToast();

  const [addAlertProvider, setAddAlertProvider] = React.useState<AlertProviderId | 'pick' | null>(null);
  const [inboundDialogOpen, setInboundDialogOpen] = React.useState(false);
  const [outboundDialogOpen, setOutboundDialogOpen] = React.useState(false);
  const [revealed, setRevealed] = React.useState<{ title: string; url?: string; secret: string } | null>(
    null,
  );

  const watchCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const conn of alertsQuery.data ?? []) {
      counts.set(conn.provider.toLowerCase(), (counts.get(conn.provider.toLowerCase()) ?? 0) + 1);
    }
    return counts;
  }, [alertsQuery.data]);

  const connectionByProvider = React.useMemo(() => {
    const map = new Map<string, IntegrationConnectionDetailDto>();
    for (const conn of connectionsQuery.data ?? []) {
      if (!map.has(conn.provider.toLowerCase())) map.set(conn.provider.toLowerCase(), conn);
    }
    return map;
  }, [connectionsQuery.data]);

  function handleConnect(providerId: string) {
    connectProvider.mutate(providerId, {
      onSuccess: (result) => {
        if (result.url) window.location.assign(result.url);
        else toast({ title: 'Connected', variant: 'success' });
      },
      onError: (err) =>
        toast({
          title: 'Could not connect',
          description: err instanceof ApiClientError ? err.message : 'Please try again.',
          variant: 'destructive',
        }),
    });
  }

  function handleDisconnect(connectionId: string) {
    disconnectConnection.mutate(connectionId, {
      onSuccess: () => toast({ title: 'Disconnected', variant: 'success' }),
      onError: (err) =>
        toast({
          title: 'Could not disconnect',
          description: err instanceof ApiClientError ? err.message : 'Please try again.',
          variant: 'destructive',
        }),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect Twitch, YouTube, GitHub, Reddit, Steam, calendars, Notion, Stripe, and your own webhooks. Every connector is optional and off until you set it up."
      />

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
        </CardHeader>
        <CardContent>
          {providersQuery.error ? (
            <ErrorState error={providersQuery.error} onRetry={() => providersQuery.refetch()} />
          ) : providersQuery.isLoading || !providersQuery.data ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {providersQuery.data.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  watchCount={watchCounts.get(provider.id)}
                  onAddWatch={() => setAddAlertProvider(provider.id as AlertProviderId)}
                  connection={connectionByProvider.get(provider.id)}
                  onConnect={() => handleConnect(provider.id)}
                  onDisconnect={() => {
                    const conn = connectionByProvider.get(provider.id);
                    if (conn) handleDisconnect(conn.id);
                  }}
                  connectPending={connectProvider.isPending}
                  disconnectPending={disconnectConnection.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="inbound">Inbound webhooks</TabsTrigger>
          <TabsTrigger value="outbound">Outbound webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAddAlertProvider('pick')}>
              <Plus className="h-4 w-4" /> Add watch
            </Button>
          </div>
          <AlertsList guildId={guildId} />
        </TabsContent>

        <TabsContent value="inbound" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setInboundDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Create webhook
            </Button>
          </div>
          <InboundWebhooksList guildId={guildId} />
        </TabsContent>

        <TabsContent value="outbound" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOutboundDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Create webhook
            </Button>
          </div>
          <OutboundWebhooksList guildId={guildId} />
        </TabsContent>
      </Tabs>

      <AlertFormDialog
        guildId={guildId}
        open={addAlertProvider !== null}
        onOpenChange={(open) => !open && setAddAlertProvider(null)}
        provider={addAlertProvider && addAlertProvider !== 'pick' ? addAlertProvider : undefined}
      />

      <InboundWebhookDialog
        guildId={guildId}
        open={inboundDialogOpen}
        onOpenChange={setInboundDialogOpen}
        onCreated={(result: CreateInboundWebhookResult) =>
          setRevealed({ title: 'Inbound webhook created', url: result.url, secret: result.secret })
        }
      />

      <OutboundWebhookDialog
        guildId={guildId}
        open={outboundDialogOpen}
        onOpenChange={setOutboundDialogOpen}
        onCreated={(result: CreateOutboundWebhookResult) =>
          setRevealed({ title: 'Outbound webhook created', secret: result.secret })
        }
      />

      {revealed ? (
        <SecretRevealDialog
          open
          onOpenChange={(open) => !open && setRevealed(null)}
          title={revealed.title}
          url={revealed.url}
          secret={revealed.secret}
        />
      ) : null}
    </div>
  );
}
