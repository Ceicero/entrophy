import * as React from 'react';
import { cn } from '../lib/cn';
import { Card, CardContent } from './card';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  hint?: string;
}

/** Small metric tile used on overview/analytics pages. */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, icon, trend, hint, ...props }, ref) => (
    <Card ref={ref} className={cn(className)} {...props}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          {trend ? (
            <p
              className={cn(
                'text-xs font-medium',
                trend.direction === 'up' && 'text-success',
                trend.direction === 'down' && 'text-destructive',
                trend.direction === 'flat' && 'text-muted-foreground',
              )}
            >
              {trend.value}
            </p>
          ) : hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {icon ? <div className="rounded-md bg-muted p-2 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div> : null}
      </CardContent>
    </Card>
  ),
);
StatCard.displayName = 'StatCard';
