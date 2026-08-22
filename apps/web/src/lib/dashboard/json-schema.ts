/**
 * Minimal JSON Schema subset the API's `configJsonSchema` (derived from each plugin's zod
 * `configSchema`) is expected to use. `JsonSchemaForm` renders a control per property.
 */
export interface JsonSchemaNode {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number)[];
  items?: JsonSchemaNode;
  /** Custom format hints: `'discord-channel' | 'discord-role'` route to the channel/role pickers. */
  format?: string;
  /** Optional hint for `format: 'discord-channel'`: restrict the picker to these channel kinds (`text`, `announcement`, `voice`, `stage`, `category`, `forum`). */
  'x-channel-kinds'?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  nullable?: boolean;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  /** Record<string, T> shape (zod `.record()`) — the value schema for every key. */
  additionalProperties?: JsonSchemaNode | boolean;
  /** Union shape (zod `.union()`/`.discriminatedUnion()`) — rendered as raw JSON, not one control per branch. */
  anyOf?: JsonSchemaNode[];
}

export type JsonSchema = JsonSchemaNode;

/** Builds a reasonable default value for a schema node when no stored/default value exists. */
export function defaultForSchema(node: JsonSchemaNode): unknown {
  if (node.default !== undefined) return node.default;
  switch (node.type) {
    case 'string':
      return node.enum && node.enum.length > 0 ? node.enum[0] : '';
    case 'number':
    case 'integer':
      return node.minimum ?? 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return node.nullable ? null : '';
  }
}
