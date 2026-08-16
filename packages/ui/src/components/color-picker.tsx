'use client';

import * as React from 'react';
import { cn } from '../lib/cn';
import { Input } from './input';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  disabled?: boolean;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Native `<input type="color">` swatch paired with an editable hex text field. */
export function ColorPicker({ value, onChange, className, disabled }: ColorPickerProps) {
  const [text, setText] = React.useState(value);

  React.useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        type="color"
        value={HEX_RE.test(value) ? value : '#6366f1'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Pick color"
      />
      <Input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (HEX_RE.test(text)) onChange(text);
          else setText(value);
        }}
        placeholder="#6366f1"
        className="font-mono uppercase"
        maxLength={7}
      />
    </div>
  );
}
