import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

/** Frosted-glass card (ARCHITECTURE.md §17): `bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl`
 * (see the `.glass` utility class in globals.css). For a non-`div` element (e.g. a clickable `next/link` card),
 * apply `className="glass ..."` directly instead — the CSS class is what carries the look. */
export function Glass({ children, className, ...rest }: GlassProps) {
  return (
    <div className={clsx('glass', className)} {...rest}>
      {children}
    </div>
  );
}
