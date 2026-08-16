/**
 * Matches config keys that hold (or are) a secret — encrypted API keys/tokens, webhook secrets, OAuth tokens.
 * Shared by the generic `/plugins/:pluginId/config` GET/PUT routes so no plugin's config drawer can leak or
 * overwrite a secret through the generic path, even though a dedicated route (e.g. `/ai/settings`) already
 * handles that plugin's secret correctly via `hasKey`/`apiKey`.
 */
const SECRET_KEY_PATTERN =
  /(secretenc|apikeyenc|tokenenc|accesstoken|refreshtoken|clientsecret|^secret$|^password$)/i;

/** Recursively removes any object key matching {@link SECRET_KEY_PATTERN}. Arrays/primitives pass through unchanged (besides recursing into array elements). */
export function omitSecretFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => omitSecretFields(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      out[key] = omitSecretFields(v);
    }
    return out as T;
  }
  return value;
}

/** Strips any top-level property matching {@link SECRET_KEY_PATTERN} from a JSON-Schema `properties` object, so the auto-generated config-drawer form never renders/collects a secret field. */
export function omitSecretSchemaProperties(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as { properties?: Record<string, unknown>; required?: string[] } & Record<string, unknown>;
  if (!s.properties) return schema;
  const properties: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(s.properties)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    properties[key] = v;
  }
  return { ...s, properties, required: s.required?.filter((key) => !SECRET_KEY_PATTERN.test(key)) };
}
