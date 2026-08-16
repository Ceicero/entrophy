import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineManifest } from '../../sdk';
import { allConfigKeys, findConfigKey, guildConfigKeys, parseConfigValue, pluginConfigKeys } from '../config-keys';

describe('guildConfigKeys', () => {
  it('lists every settable guild.* key', () => {
    const keys = guildConfigKeys();
    const keyNames = keys.map((k) => k.key);
    expect(keyNames).toContain('guild.locale');
    expect(keyNames).toContain('guild.timezone');
    expect(keyNames).toContain('guild.fastActions');
    expect(keyNames).toContain('guild.modLogChannelId');
    expect(keyNames).toContain('guild.adminRoleIds');
  });

  it('marks channel fields nullable and role-id-list fields as role-list', () => {
    const keys = guildConfigKeys();
    const modLog = keys.find((k) => k.field === 'modLogChannelId');
    expect(modLog).toMatchObject({ kind: 'channel', nullable: true });

    const adminRoles = keys.find((k) => k.field === 'adminRoleIds');
    expect(adminRoles).toMatchObject({ kind: 'role-list', nullable: false });
  });
});

describe('pluginConfigKeys', () => {
  const manifest = defineManifest({
    id: 'moderation',
    name: 'Moderation',
    description: 'test',
    category: 'moderation',
    version: '0.1.0',
    defaultEnabled: true,
    permissions: [],
    intents: [],
    requiredEnv: [],
    configSchema: z.object({
      enabled: z.boolean().default(true),
      threshold: z.number().default(5),
      logChannelId: z.string().nullable().default(null),
      trustedRoleIds: z.array(z.string()).default([]),
      note: z.string().default(''),
    }),
  });

  it('introspects a ZodObject configSchema into descriptors with guessed kinds', () => {
    const keys = pluginConfigKeys(manifest);
    const byField = Object.fromEntries(keys.map((k) => [k.field, k]));

    expect(byField.enabled).toMatchObject({ key: 'moderation.enabled', kind: 'boolean', nullable: false });
    expect(byField.threshold).toMatchObject({ kind: 'number' });
    expect(byField.logChannelId).toMatchObject({ kind: 'channel', nullable: true });
    expect(byField.trustedRoleIds).toMatchObject({ kind: 'role-list' });
    expect(byField.note).toMatchObject({ kind: 'string' });
  });

  it('returns no keys for a passthrough-only ({}) configSchema', () => {
    const stubManifest = defineManifest({
      id: 'economy',
      name: 'Economy',
      description: 'test',
      category: 'community',
      version: '0.1.0',
      defaultEnabled: false,
      permissions: [],
      intents: [],
      requiredEnv: [],
      configSchema: z.object({}).passthrough(),
    });
    expect(pluginConfigKeys(stubManifest)).toEqual([]);
  });
});

describe('allConfigKeys / findConfigKey', () => {
  const manifest = defineManifest({
    id: 'utility',
    name: 'Utility',
    description: 'test',
    category: 'utility',
    version: '0.1.0',
    defaultEnabled: true,
    permissions: [],
    intents: [],
    requiredEnv: [],
    configSchema: z.object({ greeting: z.string().default('hi') }),
  });

  it('combines guild.* keys with every manifest\'s plugin-scoped keys', () => {
    const keys = allConfigKeys([manifest]);
    expect(keys.some((k) => k.key === 'guild.locale')).toBe(true);
    expect(keys.some((k) => k.key === 'utility.greeting')).toBe(true);
  });

  it('finds a key by its dotted name', () => {
    const found = findConfigKey([manifest], 'utility.greeting');
    expect(found).toMatchObject({ scope: 'utility', field: 'greeting', kind: 'string' });
    expect(findConfigKey([manifest], 'nope.nothing')).toBeUndefined();
  });
});

describe('parseConfigValue', () => {
  const boolDescriptor = { key: 'utility.b', scope: 'utility' as const, field: 'b', kind: 'boolean' as const, nullable: false, description: '' };
  const numberDescriptor = { key: 'utility.n', scope: 'utility' as const, field: 'n', kind: 'number' as const, nullable: false, description: '' };
  const channelDescriptor = { key: 'utility.c', scope: 'utility' as const, field: 'c', kind: 'channel' as const, nullable: true, description: '' };
  const roleListDescriptor = { key: 'utility.r', scope: 'utility' as const, field: 'r', kind: 'role-list' as const, nullable: false, description: '' };
  const localeDescriptor = { key: 'guild.locale', scope: 'guild' as const, field: 'locale', kind: 'locale' as const, nullable: false, description: '' };
  const stringDescriptor = { key: 'utility.s', scope: 'utility' as const, field: 's', kind: 'string' as const, nullable: false, description: '' };

  it('parses booleans from common truthy/falsy words', () => {
    expect(parseConfigValue(boolDescriptor, 'true')).toBe(true);
    expect(parseConfigValue(boolDescriptor, 'YES')).toBe(true);
    expect(parseConfigValue(boolDescriptor, 'off')).toBe(false);
    expect(() => parseConfigValue(boolDescriptor, 'maybe')).toThrow(/not a valid boolean|isn't a valid boolean/);
  });

  it('parses numbers and rejects non-numeric input', () => {
    expect(parseConfigValue(numberDescriptor, '42')).toBe(42);
    expect(() => parseConfigValue(numberDescriptor, 'abc')).toThrow();
  });

  it('extracts a channel id from a mention or bare snowflake, and clears with "none"', () => {
    expect(parseConfigValue(channelDescriptor, '<#123456789012345678>')).toBe('123456789012345678');
    expect(parseConfigValue(channelDescriptor, '123456789012345678')).toBe('123456789012345678');
    expect(parseConfigValue(channelDescriptor, 'none')).toBeNull();
    expect(() => parseConfigValue(channelDescriptor, 'not-a-channel')).toThrow();
  });

  it('parses a comma-separated role-list, extracting ids from mentions', () => {
    expect(parseConfigValue(roleListDescriptor, '<@&111111111111111111>, 222222222222222222')).toEqual([
      '111111111111111111',
      '222222222222222222',
    ]);
    expect(parseConfigValue(roleListDescriptor, '')).toEqual([]);
  });

  it('only accepts "en" for locale keys', () => {
    expect(parseConfigValue(localeDescriptor, 'en')).toBe('en');
    expect(() => parseConfigValue(localeDescriptor, 'fr')).toThrow();
  });

  it('passes strings through as-is (trimmed)', () => {
    expect(parseConfigValue(stringDescriptor, '  hello  ')).toBe('hello');
  });
});
