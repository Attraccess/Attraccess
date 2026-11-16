/**
 * OpenAPI-derived MCP tool definitions. Tools are generated in memory from the live OpenAPI document and
 * filtered by the reviewed manifest (`reviewed-manifest.json`); no generated source is committed.
 */
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
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

/** The reviewer's decision for one operation. `shape` pins the contract that was reviewed. */
export type McpManifestEntry = { decision: 'allow' | 'deny'; reason: string; shape: string };

export type ManifestProblemKind =
  | 'unreviewed'
  | 'stale'
  | 'duplicate-operation-id'
  | 'missing-operation-id'
  | 'shape-drift'
  | 'incompatible'
  | 'invalid-entry'
  | 'unsupported-operation';

export type ManifestProblem = {
  kind: ManifestProblemKind;
  operationId?: string;
  method?: string;
  path?: string;
  /** What the developer has to do, for example the exact entry to add. */
  detail: string;
  /** Present for `unreviewed` and `shape-drift`: the shape hash the manifest must carry after review. */
  shape?: string;
};

export type DocumentOperation = { id: string; method: string; path: string; operation: OpenApiOperation };

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const pathItemKeys = new Set(['parameters', 'servers', 'summary', 'description', '$ref']);
const MAX_TOOL_NAME_LENGTH = 64;
const jsonMediaType = (type: string) => type === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/i.test(type);
// Safeguard on top of the manifest: an operation whose id or path says it streams, uploads, restarts the host
// or is a provider callback cannot be allowed by editing the manifest alone.
const incompatibleOperation =
  /(?:callback|webhook|stream|\/live\b|Live$|subscribe|binary|download|upload|restart|reboot|shutdown|host.?lifecycle|auth\/sso\/(?:OIDC|SAML|logout|link|discovery))/;
// These operations are known to return runtime streams/binary data even though Swagger omits or misstates their
// response media types. A manifest edit alone must not make them ordinary text tools.
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

function referencedSchemaNames(value: unknown, schemas: Record<string, unknown>, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) referencedSchemaNames(item, schemas, found);
    return;
  }
  if (!isSchema(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')) {
      const name = child.slice('#/components/schemas/'.length);
      if (!found.has(name)) {
        found.add(name);
        referencedSchemaNames(schemas[name], schemas, found);
      }
    } else referencedSchemaNames(child, schemas, found);
  }
}

/**
 * Stable digest of the operation contract that the reviewer approved: the operation, its path-level parameters
 * and only the component schemas it can reach. A change elsewhere in the API never invalidates it.
 */
export function operationShape(
  method: string,
  path: string,
  operation: OpenApiOperation,
  sharedParameters: unknown = [],
  schemas: Record<string, unknown> = {},
): string {
  const reachable = new Set<string>();
  referencedSchemaNames([operation, sharedParameters], schemas, reachable);
  const reachableSchemas = Object.fromEntries([...reachable].sort().map((name) => [name, schemas[name]]));
  const canonical = JSON.stringify({
    method: method.toUpperCase(),
    path,
    operation,
    sharedParameters,
    schemas: reachableSchemas,
  });
  // FNV-1a is used as a review drift marker, not as a security primitive.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function collectOperations(document: OpenApiDocument, problems: ManifestProblem[]): DocumentOperation[] {
  const operations: DocumentOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const verb = method.toLowerCase();
      if (pathItemKeys.has(verb) || verb.startsWith('x-')) continue;
      if (!methods.has(verb)) {
        problems.push({
          kind: 'unsupported-operation',
          method: verb.toUpperCase(),
          path,
          detail: `Unsupported OpenAPI operation ${verb.toUpperCase()} ${path}`,
        });
        continue;
      }
      if (!isSchema(operation)) {
        problems.push({
          kind: 'unsupported-operation',
          method: verb.toUpperCase(),
          path,
          detail: `Invalid OpenAPI operation ${verb.toUpperCase()} ${path}`,
        });
        continue;
      }
      const id = (operation as OpenApiOperation).operationId;
      if (!id || !/^[A-Za-z][A-Za-z0-9_]*$/.test(id) || id.length > MAX_TOOL_NAME_LENGTH) {
        problems.push({
          kind: 'missing-operation-id',
          method: verb.toUpperCase(),
          path,
          detail: `Missing or invalid operationId for ${verb.toUpperCase()} ${path}: set an explicit @ApiOperation({ operationId }) of at most ${MAX_TOOL_NAME_LENGTH} letters, digits or underscores`,
        });
        continue;
      }
      operations.push({ id, method: verb.toUpperCase(), path, operation: operation as OpenApiOperation });
    }
  }
  return operations;
}

function sharedParametersOf(document: OpenApiDocument, path: string): OpenApiParameter[] {
  const shared = document.paths?.[path]?.parameters;
  return Array.isArray(shared) ? (shared as OpenApiParameter[]) : [];
}

function shapeOf(document: OpenApiDocument, entry: DocumentOperation): string {
  return operationShape(
    entry.method,
    entry.path,
    entry.operation,
    document.paths?.[entry.path]?.parameters ?? [],
    document.components?.schemas ?? {},
  );
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
    throw new Error(`Incompatible endpoint ${method} ${path} cannot be allowed (${id})`);
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

/** Builds the tool for one operation, or throws why the operation cannot be a tool. */
function buildTool(document: OpenApiDocument, entry: DocumentOperation): McpTool {
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
    ...inputs,
  };
}

export type ManifestAnalysis = {
  /** Every allowed operation that is individually valid. Safe to expose even when `problems` is not empty. */
  tools: McpTool[];
  problems: ManifestProblem[];
  operations: DocumentOperation[];
};

/**
 * Compares the OpenAPI document with the manifest. It never throws: callers decide what a problem means (the drift
 * test fails on any problem; the running server only skips the affected operations).
 */
export function analyzeMcpManifest(
  document: OpenApiDocument,
  manifest: Record<string, McpManifestEntry>,
): ManifestAnalysis {
  const problems: ManifestProblem[] = [];
  const operations = collectOperations(document, problems);
  const counts = new Map<string, number>();
  for (const { id } of operations) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) {
      problems.push({
        kind: 'duplicate-operation-id',
        operationId: id,
        detail: `Duplicate operationId ${id} (${count} operations): give each operation a unique @ApiOperation({ operationId })`,
      });
    }
  }
  const ids = new Set(counts.keys());
  for (const id of Object.keys(manifest)) {
    if (!ids.has(id)) {
      problems.push({
        kind: 'stale',
        operationId: id,
        detail: `Manifest operation ${id} is absent from OpenAPI: remove "${id}" from reviewed-manifest.json`,
      });
    }
  }
  const tools: McpTool[] = [];
  for (const entry of operations) {
    const { id, method, path } = entry;
    const where = { operationId: id, method, path };
    const review = Object.prototype.hasOwnProperty.call(manifest, id) ? manifest[id] : undefined;
    const shape = shapeOf(document, entry);
    if (!review) {
      problems.push({
        ...where,
        kind: 'unreviewed',
        shape,
        detail: `Unreviewed OpenAPI operation ${id} (${method} ${path}): review it and add "${id}": { decision, reason, shape: "${shape}" } to reviewed-manifest.json`,
      });
      continue;
    }
    if (!review.reason?.trim()) {
      problems.push({ ...where, kind: 'invalid-entry', detail: `Manifest operation ${id} has no review reason` });
      continue;
    }
    if (review.decision !== 'allow' && review.decision !== 'deny') {
      problems.push({ ...where, kind: 'invalid-entry', detail: `Invalid manifest decision for ${id}` });
      continue;
    }
    if (review.shape !== shape) {
      problems.push({
        ...where,
        kind: 'shape-drift',
        shape,
        detail: `Reviewed operation shape drift for ${id} (${method} ${path}): re-review it, then set its "shape" to "${shape}" (was "${review.shape}")`,
      });
      continue;
    }
    if (review.decision === 'deny') continue;
    try {
      tools.push(buildTool(document, entry));
    } catch (error) {
      problems.push({
        ...where,
        kind: 'incompatible',
        detail: `${(error as Error).message}. Change its manifest decision to "deny" with a specific reason`,
      });
    }
  }
  return { tools, problems, operations };
}

/** Strict variant: throws on the first problem. */
export function generateMcpTools(document: OpenApiDocument, manifest: Record<string, McpManifestEntry>): McpTool[] {
  const { tools, problems } = analyzeMcpManifest(document, manifest);
  if (problems.length) throw new Error(problems[0].detail);
  return tools;
}
