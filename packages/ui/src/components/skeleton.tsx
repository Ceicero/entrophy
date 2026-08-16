import * as React from 'react';
import { cn } from '../lib/cn';

/** Loading placeholder block. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
