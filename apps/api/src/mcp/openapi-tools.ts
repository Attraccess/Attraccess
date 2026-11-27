/**
 * OpenAPI-derived MCP tool definitions. Tools are generated in memory from the live OpenAPI document by rule; there is
 * no review list and no generated source is committed. This file holds the security rules (see `README.md`):
 * an operation is a tool only if it declares `x-attraccess-auth` (set by `@Auth`, `@AuthAny`, `@SessionAuth`), is not
 * session-only, is not marked `@NotAnMcpTool` (`x-mcp-exclude`) and passes every technical exclusion below.
 */
import { AUTH_EXTENSION, MCP_EXCLUDE_EXTENSION } from '@attraccess/plugins-backend-sdk';

export type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: { schemas?: Record<string, unknown> };
};

type OpenApiParameter = { name: string; in: string; required?: boolean; schema?: Record<string, unknown> };

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: Record<string, unknown> }> };
  responses?: Record<string, { content?: Record<string, unknown> }>;
  callbacks?: Record<string, unknown>;
  'x-mcp-streaming'?: boolean;
  [MCP_EXCLUDE_EXTENSION]?: unknown;
  [AUTH_EXTENSION]?: unknown;
};

export type McpTool = {
  name: string;
  description: string;
  method: string;
  path: string;
  pathParameters: string[];
  queryParameters: string[];
  bodyProperties: string[];
  /** True when the whole request body is passed as the single `body` input instead of flattened properties. */
  wholeBody: boolean;
  /** Permissions needed to see and call the tool (`x-attraccess-auth`); the REST guard still decides each call. */
  auth: { all: string[]; any: string[] };
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

export type SkippedOperation = {
  operationId?: string;
  method: string;
  path: string;
  reason: string;
};

export type DocumentOperation = { id: string; method: string; path: string; operation: OpenApiOperation };

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const pathItemKeys = new Set(['parameters', 'servers', 'summary', 'description', '$ref']);
const MAX_TOOL_NAME_LENGTH = 64;
const jsonMediaType = (type: string) => type === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/i.test(type);
// Technical exclusion: an operation whose id or path says it streams, uploads, restarts the host or is a provider
// callback is never a tool, whatever its auth metadata says.
const incompatibleOperation =
  /(?:callback|webhook|stream|\/live\b|Live$|subscribe|binary|download|upload|restart|reboot|shutdown|host.?lifecycle|auth\/sso\/(?:OIDC|SAML|logout|link|discovery))/;
// These operations are known to return runtime streams/binary data even though Swagger omits or misstates their
// response media types. They must never become ordinary text tools.
const knownNonToolOperations = new Set(['getLogo', 'getFrontendPluginFile', 'getReaderCrashReportCoredump']);

type Schema = Record<string, unknown>;

function isSchema(value: unknown): value is Schema {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withNull(schema: Schema): Schema {
  const type = schema.type;
  if (typeof type === 'string') {
    const next: Schema = { ...schema, type: [type, 'null'] };
    if (Array.isArray(schema.enum) && !schema.enum.includes(null)) next.enum = [...schema.enum, null];
    return next;
  }
  if (Array.isArray(type)) return type.includes('null') ? schema : { ...schema, type: [...type, 'null'] };
  const { description, ...inner } = schema;
  return { ...(description === undefined ? {} : { description }), anyOf: [inner, { type: 'null' }] };
}

/**
 * Translates an OpenAPI 3.0 schema into JSON Schema: resolves `$ref`, turns `nullable: true` into a
 * null-inclusive type and refuses what cannot be a tool input (binary data, `not`, cyclic references).
 */
function resolveSchema(
  schema: Schema | undefined,
  schemas: Record<string, unknown>,
  stack = new Set<string>(),
): Schema {
  if (!schema) throw new Error('Operation has an input without a schema');
  const working: Schema = schema;
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const key = ref.replace(/^#\/components\/schemas\//, '');
    const target = schemas[key];
    if (!ref.startsWith('#/components/schemas/') || stack.has(key) || !isSchema(target)) {
      throw new Error(`Unsupported or cyclic schema reference ${ref}`);
    }
    const { nullable: siblingNullable, ...siblings } = schema;
    delete siblings.$ref;
    const target$ = { ...resolveSchema(target, schemas, new Set(stack).add(key)), ...siblings };
    return siblingNullable === true ? withNull(target$) : target$;
  }
  if (working.not) throw new Error('Negated schemas are not tool-compatible');
  if (working.format === 'binary' || working.format === 'byte')
    throw new Error('Binary schemas are not tool-compatible');

  const { nullable, ...rest } = working;
  let resolved: Schema = { ...rest };
  for (const keyword of ['allOf', 'oneOf', 'anyOf'] as const) {
    const branches = rest[keyword];
    if (branches === undefined) continue;
    if (!Array.isArray(branches) || !branches.every(isSchema)) throw new Error(`Unsupported ${keyword} schema`);
    resolved[keyword] = branches.map((branch) => resolveSchema(branch, schemas, stack));
  }
  const allOf = resolved.allOf as Schema[] | undefined;
  const single = allOf?.length === 1 ? allOf[0] : undefined;
  if (single) {
    const others = { ...resolved };
    delete others.allOf;
    resolved = { ...single, ...others };
  }
  if (resolved.type === 'object' || resolved.properties) {
    const properties = rest.properties as Record<string, Schema> | undefined;
    if (properties) {
      resolved.properties = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [key, resolveSchema(value, schemas, stack)]),
      );
    }
    const additional = rest.additionalProperties;
    if (additional !== undefined && typeof additional !== 'boolean') {
      if (!isSchema(additional)) throw new Error('Unsupported additionalProperties schema');
      resolved.additionalProperties = resolveSchema(additional, schemas, stack);
    }
  } else if (resolved.type === 'array') {
    resolved.items = resolveSchema(rest.items as Schema, schemas, stack);
  } else if (
    resolved.type !== undefined &&
    !['string', 'number', 'integer', 'boolean'].includes(String(resolved.type))
  ) {
    throw new Error(`Unsupported schema type ${String(resolved.type)}`);
  }
  if (single) mergeExtendedBase(resolved, single, rest.required);
  return nullable === true ? withNull(resolved) : resolved;
}

/** `{ allOf: [Base], properties: {...} }` extends Base: keep Base's properties and required fields. */
function mergeExtendedBase(resolved: Schema, base: Schema, ownRequired: unknown): void {
  if (!isSchema(base.properties) || !isSchema(resolved.properties) || resolved.properties === base.properties) return;
  resolved.properties = { ...base.properties, ...resolved.properties };
  const required = [base.required, ownRequired].flatMap((list) => (Array.isArray(list) ? list : []));
  if (required.length) resolved.required = [...new Set(required)];
}

const operationLabel = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

/** Operations with a valid, unique id. Everything else (also every operation sharing a duplicated id) is skipped. */
function collectOperations(document: OpenApiDocument, skipped: SkippedOperation[]): DocumentOperation[] {
  const candidates: DocumentOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const verb = method.toLowerCase();
      if (pathItemKeys.has(verb) || verb.startsWith('x-')) continue;
      const base = { method: verb.toUpperCase(), path };
      if (!methods.has(verb) || !isSchema(operation)) {
        skipped.push({ ...base, reason: `Unsupported OpenAPI operation ${operationLabel(verb, path)}` });
        continue;
      }
      const id = (operation as OpenApiOperation).operationId;
      if (!id || !/^[A-Za-z][A-Za-z0-9_]*$/.test(id) || id.length > MAX_TOOL_NAME_LENGTH) {
        skipped.push({
          ...base,
          operationId: id,
          reason: `Missing or invalid operationId: set an explicit @ApiOperation({ operationId }) of at most ${MAX_TOOL_NAME_LENGTH} letters, digits or underscores`,
        });
        continue;
      }
      candidates.push({ id, method: base.method, path, operation: operation as OpenApiOperation });
    }
  }
  const counts = new Map<string, number>();
  for (const { id } of candidates) counts.set(id, (counts.get(id) ?? 0) + 1);
  const operations: DocumentOperation[] = [];
  for (const entry of candidates) {
    const count = counts.get(entry.id) ?? 0;
    if (count > 1) {
      skipped.push({
        operationId: entry.id,
        method: entry.method,
        path: entry.path,
        reason: `Duplicate operationId (${count} operations): give each operation a unique @ApiOperation({ operationId })`,
      });
    } else operations.push(entry);
  }
  return operations;
}

function sharedParametersOf(document: OpenApiDocument, path: string): OpenApiParameter[] {
  const shared = document.paths?.[path]?.parameters;
  return Array.isArray(shared) ? (shared as OpenApiParameter[]) : [];
}

type ToolInputs = Pick<McpTool, 'pathParameters' | 'queryParameters' | 'bodyProperties' | 'wholeBody' | 'inputSchema'>;

function assertToolCompatible({ id, method, path, operation }: DocumentOperation): void {
  if (
    knownNonToolOperations.has(id) ||
    incompatibleOperation.test(id) ||
    incompatibleOperation.test(path) ||
    operation.callbacks ||
    operation['x-mcp-streaming']
  ) {
    throw new Error(`Incompatible endpoint ${method} ${path} (${id})`);
  }
}

function collectParameterInputs(document: OpenApiDocument, entry: DocumentOperation) {
  const { id, path, operation } = entry;
  const schemas = document.components?.schemas ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const pathParameters: string[] = [];
  const queryParameters: string[] = [];
  const merged = new Map<string, OpenApiParameter>();
  for (const parameter of sharedParametersOf(document, path))
    merged.set(`${parameter.in}:${parameter.name}`, parameter);
  for (const parameter of operation.parameters ?? []) merged.set(`${parameter.in}:${parameter.name}`, parameter);
  for (const parameter of merged.values()) {
    if (!['path', 'query'].includes(parameter.in)) throw new Error(`Unsupported ${parameter.in} parameter in ${id}`);
    if (Object.prototype.hasOwnProperty.call(properties, parameter.name)) {
      throw new Error(`Duplicate input ${parameter.name} in ${id}`);
    }
    properties[parameter.name] = resolveSchema(parameter.schema, schemas);
    (parameter.in === 'path' ? pathParameters : queryParameters).push(parameter.name);
    if (parameter.required || parameter.in === 'path') required.push(parameter.name);
  }
  return { properties, required, pathParameters, queryParameters };
}

/** Adds the request body to the inputs: object properties flattened, anything else as `body`. */
function addBodyInputs(
  document: OpenApiDocument,
  { id, operation }: DocumentOperation,
  properties: Record<string, unknown>,
  required: string[],
): { bodyProperties: string[]; wholeBody: boolean } {
  const body = operation.requestBody;
  if (!body) return { bodyProperties: [], wholeBody: false };
  const mediaType = Object.keys(body.content ?? {}).find(jsonMediaType);
  const json = mediaType ? body.content?.[mediaType] : undefined;
  if (!json?.schema) throw new Error(`Unsupported request media type for ${id}`);
  const bodySchema = resolveSchema(json.schema, document.components?.schemas ?? {});
  const schemaBodyProperties = bodySchema.properties as Record<string, unknown> | undefined;
  if (bodySchema.type === 'object' && schemaBodyProperties && Object.keys(schemaBodyProperties).length > 0) {
    for (const [name, schema] of Object.entries(schemaBodyProperties)) {
      if (properties[name]) throw new Error(`Request body conflicts with parameter ${name} in ${id}`);
      properties[name] = schema;
    }
    if (body.required) required.push(...((bodySchema.required as string[] | undefined) ?? []));
    return { bodyProperties: Object.keys(schemaBodyProperties), wholeBody: false };
  }
  if (properties.body) throw new Error(`Request body conflicts with input body in ${id}`);
  properties.body = bodySchema;
  if (body.required) required.push('body');
  return { bodyProperties: ['body'], wholeBody: true };
}

function assertJsonSuccessResponses({ id, operation }: DocumentOperation): void {
  for (const [code, response] of Object.entries(operation.responses ?? {})) {
    if (!/^2\d\d$/.test(code)) continue;
    if (!response || typeof response !== 'object' || '$ref' in response) {
      throw new Error(`Unsupported success response definition for ${id}`);
    }
    if (response.content && !Object.keys(response.content).every(jsonMediaType)) {
      throw new Error(`Unsupported response media type for ${id}`);
    }
  }
}

function buildInputs(document: OpenApiDocument, entry: DocumentOperation): ToolInputs {
  const { properties, required, pathParameters, queryParameters } = collectParameterInputs(document, entry);
  const { bodyProperties, wholeBody } = addBodyInputs(document, entry, properties, required);
  return {
    pathParameters,
    queryParameters,
    bodyProperties,
    wholeBody,
    inputSchema: { type: 'object', properties, required: [...new Set(required)], additionalProperties: false },
  };
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * The requirement from `x-attraccess-auth`, or the reason the operation is not a tool. Malformed metadata fails closed:
 * reading it as "no requirement" would show the tool to every caller.
 */
function authRequirement(operation: OpenApiOperation): { all: string[]; any: string[] } | string {
  const extension = operation[AUTH_EXTENSION];
  if (!isSchema(extension)) return 'No auth metadata (public or custom-guarded route)';
  const { all = [], any = [], sessionOnly = false } = extension;
  if (!isStringList(all) || !isStringList(any) || typeof sessionOnly !== 'boolean') {
    return 'Malformed auth metadata';
  }
  if (sessionOnly) return 'Session-only route';
  return { all: [...all], any: [...any] };
}

/** Builds the tool for one operation, or throws why the operation cannot be a tool. */
function buildTool(document: OpenApiDocument, entry: DocumentOperation, auth: McpTool['auth']): McpTool {
  const { id, method, path, operation } = entry;
  assertToolCompatible(entry);
  const inputs = buildInputs(document, entry);
  assertJsonSuccessResponses(entry);
  const summary = operation.summary?.trim();
  const description = operation.description?.trim();
  return {
    name: id,
    description: [summary || `${method} ${path}`, description && description !== summary ? description : undefined]
      .filter(Boolean)
      .join('\n\n'),
    method,
    path,
    auth,
    ...inputs,
  };
}

export type GeneratedMcpTools = {
  tools: McpTool[];
  /** Every operation that is not a tool, with the reason. Not an error: most operations are deliberately skipped. */
  skipped: SkippedOperation[];
};

/**
 * Derives the MCP tools from the OpenAPI document. Never throws: an operation that cannot be a tool is reported in
 * `skipped`. Order of the checks: valid unique id, auth metadata, not session-only, not `x-mcp-exclude`, technical
 * compatibility (streams, binary data, non-JSON bodies, unsupported schemas or parameters).
 */
export function generateMcpTools(document: OpenApiDocument): GeneratedMcpTools {
  const skipped: SkippedOperation[] = [];
  const tools: McpTool[] = [];
  for (const entry of collectOperations(document, skipped)) {
    const { id, method, path, operation } = entry;
    const where = { operationId: id, method, path };
    const auth = authRequirement(operation);
    if (typeof auth === 'string') {
      skipped.push({ ...where, reason: auth });
      continue;
    }
    const exclusion = operation[MCP_EXCLUDE_EXTENSION];
    if (exclusion !== undefined) {
      const reason = isSchema(exclusion) ? exclusion.reason : undefined;
      skipped.push({ ...where, reason: `Marked @NotAnMcpTool${typeof reason === 'string' ? `: ${reason}` : ''}` });
      continue;
    }
    try {
      tools.push(buildTool(document, entry, auth));
    } catch (error) {
      skipped.push({ ...where, reason: (error as Error).message });
    }
  }
  return { tools, skipped };
}
