import type { z } from 'zod';
import type { Plugin, PluginManifest } from './types';

/** Identity helper for typing a plugin definition; gives editors/inference a concrete `Plugin` shape to check against. */
export function definePlugin(p: Plugin): Plugin {
  return p;
}

export type DefineManifestInput<Schema extends z.ZodTypeAny> = Omit<PluginManifest, 'configSchema' | 'defaultConfig'> & {
  configSchema: Schema;
  /** Defaults to `configSchema.parse({})`; pass explicitly only when `{}` alone can't satisfy the schema. */
  defaultConfig?: z.infer<Schema>;
};

/**
 * Builds a `PluginManifest`, computing `defaultConfig = configSchema.parse({})` when not given explicitly,
 * and validating whatever `defaultConfig` ends up being against `configSchema` (throws if it doesn't parse —
 * every plugin config schema MUST have defaults for every field, per ARCHITECTURE.md §7.2).
 */
export function defineManifest<Schema extends z.ZodTypeAny>(input: DefineManifestInput<Schema>): PluginManifest {
  const defaultConfig = input.defaultConfig !== undefined ? input.defaultConfig : input.configSchema.parse({});
  // Validate (and normalize) whichever defaultConfig we ended up with, so a bad explicit default fails fast at
  // manifest-definition time rather than surfacing later as a confusing runtime config-store error.
  const validatedDefaultConfig: unknown = input.configSchema.parse(defaultConfig);

  return {
    ...input,
    defaultConfig: validatedDefaultConfig,
  };
}
