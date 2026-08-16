'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@entrophy/ui';
import { useAnalytics, type AnalyticsRange } from '../../../../lib/queries';
import { ErrorState } from '../../../../components/error-state';
import { ApiClientError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/format';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function AnalyticsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [range, setRange] = React.useState<AnalyticsRange>('7d');
  const { data, isLoading, error, refetch } = useAnalytics(guildId, range);

  const dataCollectionDisabled = error instanceof ApiClientError && error.code === 'data_collection_disabled';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Member growth, moderation volume, and message activity."
        actions={
          <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {dataCollectionDisabled ? (
        <EmptyState
          icon={<Lock />}
          title="Analytics is off for this server"
          description="Turn on analytics data collection in Settings to see member growth, moderation volume, and message activity here. No message content is ever collected."
          action={
            <Button asChild>
              <Link href={`/dashboard/${guildId}/settings`}>Go to Settings</Link>
            </Button>
          }
        />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Member growth</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.memberGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="joins" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} name="Joins" />
                  <Line type="monotone" dataKey="leaves" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 3" dot={false} name="Leaves" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Moderation volume</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.moderationVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} name="Cases" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Message activity</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.messageActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} name="Messages" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
