import * as React from 'react';
import { cn } from '../lib/cn';
import { buttonVariants, type ButtonProps } from './button';

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  label: string;
  size?: 'default' | 'sm' | 'lg';
}

/** Square icon-only button. Requires `label` for screen readers (rendered as `aria-label` + `sr-only` text). */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'default', label, children, ...props }, ref) => {
    const dimension = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(buttonVariants({ variant }), dimension, 'p-0', className)}
        {...props}
      >
        {children}
        <span className="sr-only">{label}</span>
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
