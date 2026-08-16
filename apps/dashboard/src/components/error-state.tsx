import { AlertTriangle } from 'lucide-react';
import { Button, EmptyState } from '@entrophy/ui';
import { ApiClientError } from '../lib/api';

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

/** Standard error display for a failed query, with a human message and an optional retry button. */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }: ErrorStateProps) {
  const description =
    error instanceof ApiClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.';

  return (
    <EmptyState
      icon={<AlertTriangle />}
      title={title}
      description={description}
      action={onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}
