import * as React from 'react';
import { cn } from '../lib/cn';
import { Label } from './label';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/** Label + control + hint/error slot. Pass the control as `children`. */
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, htmlFor, hint, error, required, children, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-1.5', className)} {...props}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  ),
);
FormField.displayName = 'FormField';
