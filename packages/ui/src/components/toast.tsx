'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { cn } from '../lib/cn';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss; 0 disables auto-dismiss. Default 5000. */
  duration?: number;
}

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

/**
 * Minimal toast store (no context provider needed) — a module-level subscriber list so `useToast()`
 * can be called from any client component while `<Toaster />` (mounted once in the app layout) renders
 * whatever is queued.
 */
let toasts: ToastItem[] = [];
const listeners = new Set<(next: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function addToast(options: ToastOptions): string {
  const id = options.id ?? `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const duration = options.duration ?? 5000;
  toasts = [
    ...toasts,
    {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'default',
      duration,
    },
  ];
  emit();
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

/** Hook for firing toasts (`toast()`) and reading/dismissing the current queue. */
export function useToast() {
  const [state, setState] = React.useState<ToastItem[]>(toasts);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return { toasts: state, toast: addToast, dismiss: dismissToast };
}

const variantStyles: Record<ToastVariant, string> = {
  default: 'border-border bg-card text-card-foreground',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  success: 'border-success/40 bg-success/10 text-success',
};

/** Renders the queued toasts. Mount once near the root of the app (e.g. root layout). */
export function Toaster() {
  const { toasts: items, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:right-0 sm:left-auto sm:max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-auto flex w-full items-start gap-3 rounded-md border p-4 shadow-lg animate-slide-in-from-bottom',
            variantStyles[t.variant],
          )}
        >
          {t.variant === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          {t.variant === 'destructive' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          <div className="flex-1 space-y-1">
            {t.title ? <p className="text-sm font-medium">{t.title}</p> : null}
            {t.description ? <p className="text-sm opacity-90">{t.description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
