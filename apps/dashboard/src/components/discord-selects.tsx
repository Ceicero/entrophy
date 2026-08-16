'use client';

import { ChannelPicker, Input, RolePicker } from '@entrophy/ui';
import { useGuildChannels, useGuildRoles } from '../lib/queries';

export interface DiscordChannelSelectProps {
  guildId: string;
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Single-channel picker backed by `GET /guilds/:id/discord/channels`; falls back to a raw-id text input if that endpoint errors. */
export function DiscordChannelSelect({ guildId, value, onChange, placeholder, disabled }: DiscordChannelSelectProps) {
  const { data: channels, isError, isLoading } = useGuildChannels(guildId);
  if (isError) {
    return <Input value={value ?? ''} placeholder="Channel ID" disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
  }
  return (
    <ChannelPicker options={channels ?? []} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled || isLoading} />
  );
}

export interface DiscordRoleSelectProps {
  guildId: string;
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Single-role picker backed by `GET /guilds/:id/discord/roles`; falls back to a raw-id text input if that endpoint errors. */
export function DiscordRoleSelect({ guildId, value, onChange, placeholder, disabled }: DiscordRoleSelectProps) {
  const { data: roles, isError, isLoading } = useGuildRoles(guildId);
  if (isError) {
    return <Input value={value ?? ''} placeholder="Role ID" disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
  }
  return <RolePicker options={roles ?? []} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled || isLoading} />;
}
