'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/cn';
import { IconButton } from './icon-button';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  copyable?: boolean;
}

/** Monospace code display with an optional one-click copy button. */
export function CodeBlock({ className, code, language, copyable = true, ...props }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className={cn('group relative overflow-hidden rounded-md border border-border bg-muted', className)} {...props}>
      {copyable ? (
        <IconButton
          label={copied ? 'Copied' : 'Copy code'}
          size="sm"
          className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
      ) : null}
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code data-language={language}>{code}</code>
      </pre>
    </div>
  );
}
