import { z } from 'zod';

/** Minimal JSON-Schema-ish description of a zod type, good enough for the dashboard to auto-render a config form. */
export interface JsonSchemaLike {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchemaLike[];
  additionalProperties?: JsonSchemaLike | boolean;
  description?: string;
  default?: unknown;
  nullable?: boolean;
  optional?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  [extra: string]: unknown;
}

/**
 * Converts a zod schema into a small JSON-Schema-ish object covering the shapes plugin `configSchema`s
 * actually use: object/string/number/boolean/enum/array/nullable/optional/default/describe (plus record,
 * literal, and union as a convenience). Not a full JSON Schema implementation — purpose-built for
 * `GET /guilds/:guildId/plugins/:pluginId/config-schema` so the dashboard can auto-render a form.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchemaLike {
  const description = schema.description ? { description: schema.description } : {};

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType as z.ZodTypeAny);
    return { ...inner, default: schema._def.defaultValue(), ...description };
  }

  if (schema instanceof z.ZodOptional) {
    const inner = zodToJsonSchema(schema._def.innerType as z.ZodTypeAny);
    return { ...inner, optional: true, ...description };
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType as z.ZodTypeAny);
    return { ...inner, nullable: true, ...description };
  }

  if (schema instanceof z.ZodEffects) {
    return { ...zodToJsonSchema(schema._def.schema as z.ZodTypeAny), ...description };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchemaLike> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const isOptional = value instanceof z.ZodOptional || value instanceof z.ZodDefault;
      if (!isOptional) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      ...description,
    };
  }

  if (schema instanceof z.ZodString) {
    const checks = schema._def.checks as { kind: string; value?: number }[];
    const min = checks.find((c) => c.kind === 'min')?.value;
    const max = checks.find((c) => c.kind === 'max')?.value;
    return {
      type: 'string',
      ...(min !== undefined ? { minLength: min } : {}),
      ...(max !== undefined ? { maxLength: max } : {}),
      ...description,
    };
  }

  if (schema instanceof z.ZodNumber) {
    const checks = schema._def.checks as { kind: string; value?: number }[];
    const min = checks.find((c) => c.kind === 'min')?.value;
    const max = checks.find((c) => c.kind === 'max')?.value;
    return {
      type: 'number',
      ...(min !== undefined ? { minimum: min } : {}),
      ...(max !== undefined ? { maximum: max } : {}),
      ...description,
    };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', ...description };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values as unknown[], ...description };
  }

  if (schema instanceof z.ZodNativeEnum) {
    return { type: 'string', enum: Object.values(schema._def.values as Record<string, unknown>), ...description };
  }

  if (schema instanceof z.ZodLiteral) {
    return { const: schema._def.value, ...description };
  }

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema._def.type as z.ZodTypeAny), ...description };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: zodToJsonSchema(schema._def.valueType as z.ZodTypeAny), ...description };
  }

  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const options = (schema._def.options as z.ZodTypeAny[] | Map<string, z.ZodTypeAny>) ?? [];
    const list = options instanceof Map ? [...options.values()] : options;
    return { anyOf: list.map((option) => zodToJsonSchema(option)), ...description };
  }

  return { type: 'unknown', ...description };
}
