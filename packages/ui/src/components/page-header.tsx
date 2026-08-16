import * as React from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

/** Standard page title row: title + description on the left, actions on the right. */
export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, actions, breadcrumb, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between', className)} {...props}>
      <div className="space-y-1">
        {breadcrumb}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  ),
);
PageHeader.displayName = 'PageHeader';
