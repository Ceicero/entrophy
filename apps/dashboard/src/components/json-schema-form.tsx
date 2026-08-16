'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import {
  Badge,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@entrophy/ui';
import { defaultForSchema, type JsonSchemaNode } from '../lib/json-schema';
import { DiscordChannelSelect, DiscordRoleSelect } from './discord-selects';

export interface JsonSchemaFormProps {
  schema: JsonSchemaNode;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  guildId: string;
  disabled?: boolean;
}

/**
 * Renders a form from the API's `configJsonSchema` for a plugin's per-guild config.
 * Supports string/number/boolean/enum/array-of-strings (tag input) and nullable fields.
 * `format: 'discord-channel' | 'discord-role'` route to the channel/role pickers; if the
 * `GET /guilds/:id/discord/channels|roles` endpoints error (not yet implemented by the API),
 * those fields fall back to a plain text input for the raw id.
 */
export function JsonSchemaForm({ schema, value, onChange, guildId, disabled }: JsonSchemaFormProps) {
  const properties = schema.properties ?? {};
  const entries = Object.entries(properties);

  function setField(key: string, next: unknown) {
    onChange({ ...value, [key]: next });
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">This plugin has no configurable options.</p>;
  }

  return (
    <div className="space-y-5">
      {entries.map(([key, node]) => (
        <SchemaField
          key={key}
          fieldKey={key}
          node={node}
          value={value[key]}
          onChange={(next) => setField(key, next)}
          guildId={guildId}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface SchemaFieldProps {
  fieldKey: string;
  node: JsonSchemaNode;
  value: unknown;
  onChange: (next: unknown) => void;
  guildId: string;
  disabled?: boolean;
}

function SchemaField({ fieldKey, node, value, onChange, guildId, disabled }: SchemaFieldProps) {
  const label = node.title ?? humanizeKey(fieldKey);
  const htmlId = `field-${fieldKey}`;
  const resolved = value === undefined ? defaultForSchema(node) : value;

  // Boolean → Switch, on its own row (no separate label control needed beyond FormField's).
  if (node.type === 'boolean') {
    return (
      <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {node.description ? <p className="text-xs text-muted-foreground">{node.description}</p> : null}
        </div>
        <Switch checked={Boolean(resolved)} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
      </div>
    );
  }

  // Discord channel/role formats.
  if (node.format === 'discord-channel') {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <DiscordChannelSelect guildId={guildId} value={(resolved as string | null) ?? null} onChange={onChange} disabled={disabled} />
      </FormField>
    );
  }
  if (node.format === 'discord-role') {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <DiscordRoleSelect guildId={guildId} value={(resolved as string | null) ?? null} onChange={onChange} disabled={disabled} />
      </FormField>
    );
  }

  // Enum → Select.
  if (node.enum && node.enum.length > 0) {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <Select value={String(resolved ?? '')} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={htmlId}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {node.enum.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    );
  }

  // Array of strings → tag input.
  if (node.type === 'array' && (!node.items || node.items.type === 'string')) {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <TagInput id={htmlId} value={Array.isArray(resolved) ? (resolved as string[]) : []} onChange={onChange} disabled={disabled} />
      </FormField>
    );
  }

  // Number / integer.
  if (node.type === 'number' || node.type === 'integer') {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <Input
          id={htmlId}
          type="number"
          step={node.type === 'integer' ? 1 : 'any'}
          min={node.minimum}
          max={node.maximum}
          value={resolved === null || resolved === undefined ? '' : String(resolved)}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(node.nullable ? null : 0);
              return;
            }
            const n = node.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
            if (!Number.isNaN(n)) onChange(n);
          }}
        />
      </FormField>
    );
  }

  // Long text (format hint) vs short text.
  if (node.format === 'textarea') {
    return (
      <FormField label={label} htmlFor={htmlId} hint={node.description}>
        <Textarea
          id={htmlId}
          value={typeof resolved === 'string' ? resolved : ''}
          disabled={disabled}
          maxLength={node.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
    );
  }

  // Default: plain string input.
  return (
    <FormField label={label} htmlFor={htmlId} hint={node.description}>
      <Input
        id={htmlId}
        value={typeof resolved === 'string' ? resolved : resolved === null ? '' : String(resolved ?? '')}
        disabled={disabled}
        minLength={node.minLength}
        maxLength={node.maxLength}
        onChange={(e) => onChange(node.nullable && e.target.value === '' ? null : e.target.value)}
      />
    </FormField>
  );
}

function TagInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState('');

  function commit() {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => onChange(value.filter((t) => t !== tag))}
                  className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder="Type a value and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}
