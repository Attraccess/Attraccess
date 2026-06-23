import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

// ─── AsyncAPI 2.x types ───────────────────────────────────────────────────────

interface AsyncApiSpec {
  channels: Record<string, {
    publish?: { message?: { payload?: SchemaOrRef } };
    subscribe?: { message?: { payload?: SchemaOrRef } };
  }>;
  components?: { schemas?: Record<string, JsonSchema> };
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  items?: JsonSchema;
  $ref?: string;
}

type SchemaOrRef = JsonSchema | { $ref: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function refName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] ?? ref;
}

function resolveSchema(schemaOrRef: SchemaOrRef | undefined | null, schemas: Record<string, JsonSchema>): JsonSchema | null {
  if (!schemaOrRef) return null;
  if ('$ref' in schemaOrRef && schemaOrRef.$ref) {
    const name = refName(schemaOrRef.$ref);
    return schemas[name] ?? null;
  }
  return schemaOrRef as JsonSchema;
}

function toPascalCase(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function toMethodName(channel: string): string {
  const parts = channel.split('_');
  const meaningful = parts.slice(1);
  return meaningful.map((p, i) => i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

function toEventName(channel: string): string {
  // strip leading COMPANION_ prefix so events are e.g. 'register_response' not 'companion_register_response'
  return channel.replace(/^COMPANION_/, '').toLowerCase();
}

function jsonSchemaToTs(schema: JsonSchema | null, schemas: Record<string, JsonSchema>, indent = 0): string {
  if (!schema) return 'unknown';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const lines = Object.entries(props).map(([k, v]) => {
      const opt = required.has(k) ? '' : '?';
      const resolved = resolveSchema(v, schemas) ?? v;
      const typeStr = jsonSchemaToTs(resolved, schemas, indent + 2);
      const desc = v.description ? `\n${' '.repeat(indent + 2)}/** ${v.description} */\n${' '.repeat(indent + 2)}` : `${' '.repeat(indent + 2)}`;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

const specPath = resolve('dist/apps/api/asyncapi.json');
const outDir = resolve('libs/companion-ws-client/src/lib');

mkdirSync(outDir, { recursive: true });

const spec: AsyncApiSpec = JSON.parse(readFileSync(specPath, 'utf8'));
const schemas = spec.components?.schemas ?? {};

interface ChannelInfo {
  channel: string;
  schemaName: string | null;
  schema: JsonSchema | null;
}

// Channels where the CLIENT sends (spec "publish" = client publishes to server)
const clientSends: ChannelInfo[] = [];
// Channels where the CLIENT receives (spec "subscribe" = client subscribes to server)
const clientReceives: ChannelInfo[] = [];

for (const [channel, ops] of Object.entries(spec.channels)) {
  if (ops.publish) {
    const payload = ops.publish.message?.payload;
    const schemaRef = payload && '$ref' in payload && payload.$ref ? refName(payload.$ref) : null;
    const schema = resolveSchema(payload, schemas);
    clientSends.push({ channel, schemaName: schemaRef, schema });
  }
  if (ops.subscribe) {
    const payload = ops.subscribe.message?.payload;
    const schemaRef = payload && '$ref' in payload && payload.$ref ? refName(payload.$ref) : null;
    const schema = resolveSchema(payload, schemas);
    clientReceives.push({ channel, schemaName: schemaRef, schema });
  }
}

// ─── Generate types.ts ────────────────────────────────────────────────────────

const emittedSchemas: string[] = [];

function collectReferencedSchemas(schema: JsonSchema | null): string[] {
  const refs: string[] = [];
  if (!schema) return refs;
  if (schema.$ref) refs.push(refName(schema.$ref));
  if (schema.properties) {
    for (const v of Object.values(schema.properties)) {
      const resolved = resolveSchema(v, schemas) ?? v;
      for (const r of collectReferencedSchemas(resolved)) refs.push(r);
    }
  }
  if (schema.items) {
    const resolved = resolveSchema(schema.items, schemas) ?? schema.items;
    for (const r of collectReferencedSchemas(resolved)) refs.push(r);
  }
  return refs;
}

const neededSchemasList: string[] = [];
for (const { schemaName, schema } of [...clientSends, ...clientReceives]) {
  if (schemaName && schemaName !== 'Object') neededSchemasList.push(schemaName);
  if (schema) {
    for (const r of collectReferencedSchemas(schema)) {
      if (r !== 'Object') neededSchemasList.push(r);
    }
  }
}
const neededSchemas = neededSchemasList.filter((v, i, a) => a.indexOf(v) === i);

let typesContent = `// Auto-generated by libs/companion-ws-client/tools/generate.ts — do not edit\n\n`;

function emitSchema(name: string) {
  if (emittedSchemas.indexOf(name) !== -1) return;
  emittedSchemas.push(name);
  const schema = schemas[name];
  if (!schema || !schema.properties) return;

  // emit dependencies first
  for (const v of Object.values(schema.properties)) {
    if ('$ref' in v && v.$ref) emitSchema(refName(v.$ref));
    else if (v.items && '$ref' in v.items && typeof v.items.$ref === 'string') emitSchema(refName(v.items.$ref));
  }

  const required = new Set(schema.required ?? []);
  const props = Object.entries(schema.properties).map(([k, v]) => {
    const opt = required.has(k) ? '' : '?';
    let typeStr: string;
    if ('$ref' in v && v.$ref) {
      typeStr = refName(v.$ref);
    } else if (v.type === 'array' && v.items) {
      // Preserve $ref name for array items rather than inlining the resolved schema
      typeStr = ('$ref' in v.items && v.items.$ref ? refName(v.items.$ref) : jsonSchemaToTs(resolveSchema(v.items, schemas) ?? v.items, schemas, 2)) + '[]';
    } else {
      typeStr = jsonSchemaToTs(v, schemas, 2);
    }
    const desc = v.description ? `  /** ${v.description} */\n` : '';
    return `${desc}  ${k}${opt}: ${typeStr};`;
  });
  typesContent += `export interface ${name} {\n${props.join('\n')}\n}\n\n`;
}

for (const name of neededSchemas) emitSchema(name);

writeFileSync(join(outDir, 'types.ts'), typesContent.trimEnd() + '\n');

// ─── Generate client.ts ───────────────────────────────────────────────────────

const sendTypes = clientSends.map(s => s.schemaName).filter((n): n is string => !!n && n !== 'Object');
const receiveTypes = clientReceives.map(s => s.schemaName).filter((n): n is string => !!n && n !== 'Object');
const uniqueTypes = [...sendTypes, ...receiveTypes].filter((v, i, a) => a.indexOf(v) === i);
const typeImports = uniqueTypes.length > 0 ? `import type { ${uniqueTypes.join(', ')} } from './types';\n` : '';

// EventEmitter overloads for subscribe channels (client receives)
const onOverloads = clientReceives.map(({ channel, schemaName }) => {
  const event = toEventName(channel);
  const payloadType = schemaName && schemaName !== 'Object' ? schemaName : null;
  const listenerType = payloadType ? `(payload: ${payloadType}) => void` : `() => void`;
  return `  on(event: '${event}', listener: ${listenerType}): this;`;
});
onOverloads.push(`  on(event: 'connected', listener: () => void): this;`);
onOverloads.push(`  on(event: 'disconnected', listener: () => void): this;`);

// Send methods for publish channels (client sends)
const sendMethods = clientSends.map(({ channel, schemaName }) => {
  const method = toMethodName(channel);
  const payloadType = schemaName && schemaName !== 'Object' ? schemaName : null;
  const param = payloadType ? `payload: ${payloadType}` : null;
  const sendArg = param ? `, payload` : `, {}`;
  return `  send${toPascalCase(method)}(${param ?? ''}) {\n    this.send('${channel}'${sendArg});\n  }`;
});

// Dispatch cases for subscribe channels (client receives)
const dispatchCases = clientReceives.map(({ channel, schemaName }) => {
  const event = toEventName(channel);
  const hasPayload = !!(schemaName && schemaName !== 'Object');
  const emitArg = hasPayload ? ', data' : '';
  return `      case '${channel}':\n        this.emit('${event}'${emitArg});\n        break;`;
});

const clientTs = `// Auto-generated by libs/companion-ws-client/tools/generate.ts — do not edit
import WebSocket from 'ws';
import { EventEmitter } from 'events';
${typeImports}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface CompanionWsClient {
${onOverloads.join('\n')}
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CompanionWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 2000;
  private readonly maxDelay = 60000;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly serverUrl: string) {
    super();
  }

  connect() {
    this.stopped = false;
    this.reconnectDelay = 2000;
    this.openSocket();
  }

  private openSocket() {
    const url = this.serverUrl.replace(/^http/, 'ws') + '/api/companion/websocket';
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 2000;
      this.emit('connected');
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; data: unknown };
        this.dispatch(msg.event, msg.data);
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      if (!this.stopped) this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      // close fires after error; reconnect handled there
    });
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  // ─── Send methods (Client → Server) ──────────────────────────────────────
${sendMethods.join('\n\n')}

  private send(event: string, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  // ─── Receive dispatch (Server → Client) ──────────────────────────────────
  private dispatch(event: string, data: unknown) {
    switch (event) {
${dispatchCases.join('\n')}
    }
  }
}
`;

writeFileSync(join(outDir, 'client.ts'), clientTs);

console.log(`Generated companion-ws-client in ${outDir}`);
