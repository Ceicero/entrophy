'use client';

import * as React from 'react';
import { Hash, Volume2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/** Minimal channel shape needed for the picker — deliberately not coupled to `@entrophy/types` so `@entrophy/ui` has no runtime dependency on it. Structurally compatible with `DiscordChannelOption`. */
export interface ChannelPickerOption {
  id: string;
  name: string;
  /** Discord channel type (2 = voice, 13 = stage voice render with a speaker icon; everything else renders with a hash icon). */
  type?: number;
}

export interface ChannelPickerProps {
  options: ChannelPickerOption[];
  value: string | null;
  onChange: (channelId: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
}

const NONE = '__none__';
// Discord channel type 2 = voice, 13 = stage voice.
const VOICE_TYPES = new Set([2, 13]);

/** Select over provided Discord channel options, with a text/voice icon per option. */
export function ChannelPicker({ options, value, onChange, placeholder = 'Select a channel', allowNone = true, noneLabel = 'None', disabled }: ChannelPickerProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id}>
            <span className="flex items-center gap-1.5">
              {VOICE_TYPES.has(opt.type ?? 0) ? <Volume2 className="h-3.5 w-3.5 text-muted-foreground" /> : <Hash className="h-3.5 w-3.5 text-muted-foreground" />}
              {opt.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
