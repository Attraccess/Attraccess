// ─── AsyncAPI 2.x types ───────────────────────────────────────────────────────

export interface AsyncApiSpec {
  channels: Record<
    string,
    {
      publish?: { message?: { payload?: SchemaOrRef } };
      subscribe?: { message?: { payload?: SchemaOrRef } };
    }
  >;
  components?: { schemas?: Record<string, JsonSchema> };
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  items?: JsonSchema;
  $ref?: string;
}

export type SchemaOrRef = JsonSchema | { $ref: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function refName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] ?? ref;
}

export function resolveSchema(
  schemaOrRef: SchemaOrRef | undefined | null,
  schemas: Record<string, JsonSchema>,
): JsonSchema | null {
  if (!schemaOrRef) return null;
  if ('$ref' in schemaOrRef && schemaOrRef.$ref) {
    const name = refName(schemaOrRef.$ref);
    return schemas[name] ?? null;
  }
  return schemaOrRef as JsonSchema;
}

export function toPascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toMethodName(channel: string): string {
  const parts = channel.split('_');
  const meaningful = parts.slice(1);
  return meaningful
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join('');
}

export function toEventName(channel: string): string {
  // strip leading COMPANION_ prefix so events are e.g. 'register_response' not 'companion_register_response'
  return channel.replace(/^COMPANION_/, '').toLowerCase();
}

export function jsonSchemaToTs(schema: JsonSchema | null, schemas: Record<string, JsonSchema>, indent = 0): string {
  if (!schema) return 'unknown';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const lines = Object.entries(props).map(([k, v]) => {
      const opt = required.has(k) ? '' : '?';
      const resolved = resolveSchema(v, schemas) ?? v;
      const typeStr = jsonSchemaToTs(resolved, schemas, indent + 2);
      const desc = v.description
        ? `\n${' '.repeat(indent + 2)}/** ${v.description} */\n${' '.repeat(indent + 2)}`
        : `${' '.repeat(indent + 2)}`;
      return `${desc}${k}${opt}: ${typeStr};`;
    });
    if (!lines.length) return 'Record<string, never>';
    return `{\n${lines.join('\n')}\n${' '.repeat(indent)}}`;
  }
  if (schema.type === 'array') {
    const itemSchema = schema.items ? (resolveSchema(schema.items, schemas) ?? schema.items) : null;
    const itemType = jsonSchemaToTs(itemSchema, schemas, indent);
    return `${itemType}[]`;
  }
  const typeMap: Record<string, string> = { string: 'string', number: 'number', integer: 'number', boolean: 'boolean' };
  return typeMap[schema.type ?? ''] ?? 'unknown';
}

export interface ChannelInfo {
  channel: string;
  schemaName: string | null;
  schema: JsonSchema | null;
}
