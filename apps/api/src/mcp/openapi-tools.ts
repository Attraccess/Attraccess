/** OpenAPI-derived MCP tool definitions. Generated in memory; no generated source is committed. */
export type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: { schemas?: Record<string, unknown> };
};
type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean; schema?: Record<string, unknown> }>;
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
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const pathItemKeys = new Set(['parameters', 'servers', 'summary', 'description', '$ref']);
const incompatibleOperation = /(?:callback|webhook|stream|live|subscribe|binary|download|upload|firmware|restart|shutdown|host.?lifecycle|auth\/sso)/i;
// These operations are known to return runtime streams/binary data even though
// Swagger omits or misstates their response media types. A manifest edit alone
// must not make them ordinary text tools.
const knownNonToolOperations = new Set(['getLogo', 'getFrontendPluginFile']);

function resolveSchema(schema: Record<string, unknown> | undefined, schemas: Record<string, unknown>, stack = new Set<string>()): Record<string, unknown> {
  if (!schema) throw new Error('Operation has an input without a schema');
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const key = ref.replace(/^#\/components\/schemas\//, '');
    if (!ref.startsWith('#/components/schemas/') || stack.has(key) || !schemas[key] || typeof schemas[key] !== 'object') {
      throw new Error(`Unsupported or cyclic schema reference ${ref}`);
    }
    const nextStack = new Set(stack).add(key);
    return resolveSchema(schemas[key] as Record<string, unknown>, schemas, nextStack);
  }
  if (schema.allOf || schema.oneOf || schema.anyOf || schema.not) throw new Error('Composed schemas require explicit review');
  if (schema.format === 'binary' || schema.format === 'byte') throw new Error('Binary schemas are not tool-compatible');
  if (schema.type === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties ?? {})) resolved[key] = resolveSchema(value, schemas, stack);
    return { ...schema, properties: resolved };
  }
  if (schema.type === 'array') return { ...schema, items: resolveSchema(schema.items as Record<string, unknown>, schemas, stack) };
  if (!['string', 'number', 'integer', 'boolean'].includes(String(schema.type)) && schema.enum === undefined) {
    throw new Error(`Unsupported schema type ${String(schema.type)}`);
  }
  return { ...schema };
}

/** Validate full exported coverage against a reviewed per-operation allow/deny manifest. */
export type McpManifestEntry = { decision: 'allow' | 'deny'; reason: string; shape: string };

/** Stable digest of the operation contract which the reviewer approved. */
export function operationShape(
  method: string,
  path: string,
  operation: OpenApiOperation,
  sharedParameters: unknown = [],
  schemas: Record<string, unknown> = {},
): string {
  const canonical = JSON.stringify({ method: method.toUpperCase(), path, operation, sharedParameters, schemas });
  // FNV-1a is used as a review drift marker, not as a security primitive.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function generateMcpTools(document: OpenApiDocument, manifest: Record<string, McpManifestEntry>): McpTool[] {
  const operations = new Map<string, { method: string; path: string; operation: OpenApiOperation }>();
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const verb = method.toLowerCase();
      if (pathItemKeys.has(verb) || verb.startsWith('x-')) continue;
      if (!methods.has(verb)) throw new Error(`Unsupported OpenAPI operation ${method.toUpperCase()} ${path}`);
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error(`Invalid OpenAPI operation ${verb.toUpperCase()} ${path}`);
      const openApiOperation = operation as OpenApiOperation;
      const id = openApiOperation.operationId;
      if (!id || !/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) throw new Error(`Missing or invalid operationId for ${verb.toUpperCase()} ${path}`);
      if (operations.has(id)) throw new Error(`Duplicate operationId ${id}`);
      operations.set(id, { method: verb.toUpperCase(), path, operation: openApiOperation });
    }
  }
  const ids = new Set(operations.keys());
  for (const id of ids) if (!Object.prototype.hasOwnProperty.call(manifest, id)) throw new Error(`Unreviewed OpenAPI operation ${id}`);
  for (const id of Object.keys(manifest)) if (!ids.has(id)) throw new Error(`Manifest operation ${id} is absent from OpenAPI`);
  const schemas = document.components?.schemas ?? {};
  const tools: McpTool[] = [];
  for (const [id, entry] of operations) {
    const review = manifest[id];
    if (!review.reason.trim()) throw new Error(`Manifest operation ${id} has no review reason`);
    const reviewedSharedParameters = document.paths?.[entry.path]?.parameters ?? [];
    if (review.shape !== operationShape(entry.method, entry.path, entry.operation, reviewedSharedParameters, schemas)) {
      throw new Error(`Reviewed operation shape drift for ${id}`);
    }
    if (review.decision !== 'allow' && review.decision !== 'deny') throw new Error(`Invalid manifest decision for ${id}`);
    if (review.decision === 'deny') continue;
    if (
      knownNonToolOperations.has(id) ||
      incompatibleOperation.test(`${id} ${entry.path}`) ||
      entry.operation.callbacks ||
      entry.operation['x-mcp-streaming']
    ) throw new Error(`Incompatible endpoint ${entry.method} ${entry.path} cannot be allowed (${id})`);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const pathParameters: string[] = [];
    const queryParameters: string[] = [];
    const bodyProperties: string[] = [];
    const sharedPathParameters = document.paths?.[entry.path]?.parameters;
    const sharedParameters = Array.isArray(sharedPathParameters) ? sharedPathParameters as OpenApiOperation['parameters'] : [];
    const mergedParameters = new Map<string, NonNullable<OpenApiOperation['parameters']>[number]>();
    for (const parameter of sharedParameters ?? []) mergedParameters.set(`${parameter.in}:${parameter.name}`, parameter);
    for (const parameter of entry.operation.parameters ?? []) mergedParameters.set(`${parameter.in}:${parameter.name}`, parameter);
    for (const parameter of mergedParameters.values()) {
      if (!['path', 'query'].includes(parameter.in)) throw new Error(`Unsupported ${parameter.in} parameter in ${id}`);
      if (Object.prototype.hasOwnProperty.call(properties, parameter.name)) throw new Error(`Duplicate input ${parameter.name} in ${id}`);
      properties[parameter.name] = resolveSchema(parameter.schema, schemas);
      if (parameter.in === 'path') pathParameters.push(parameter.name);
      if (parameter.in === 'query') queryParameters.push(parameter.name);
      if (parameter.required || parameter.in === 'path') required.push(parameter.name);
    }
    const body = entry.operation.requestBody;
    if (body) {
      const jsonMediaType = Object.keys(body.content ?? {}).find((type) =>
        type === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/i.test(type),
      );
      const json = jsonMediaType ? body.content?.[jsonMediaType] : undefined;
      if (!json?.schema) throw new Error(`Unsupported request media type for ${id}`);
      const bodySchema = resolveSchema(json.schema, schemas);
      const schemaBodyProperties = bodySchema.properties as Record<string, unknown> | undefined;
      if (bodySchema.type === 'object' && schemaBodyProperties && Object.keys(schemaBodyProperties).length > 0) {
        for (const [name, schema] of Object.entries(schemaBodyProperties)) {
          if (properties[name]) throw new Error(`Request body conflicts with parameter ${name} in ${id}`);
          properties[name] = schema;
          bodyProperties.push(name);
        }
        if (body.required) required.push(...((bodySchema.required as string[] | undefined) ?? []));
      } else {
        if (properties.body) throw new Error(`Request body conflicts with input body in ${id}`);
        properties.body = bodySchema;
        bodyProperties.push('body');
        if (body.required) required.push('body');
      }
    }
    const successResponses = Object.entries(entry.operation.responses ?? {}).filter(([code]) => /^2\d\d$/.test(code));
    if (!successResponses.length) throw new Error(`Operation ${id} has no declared success response`);
    for (const [, successResponse] of successResponses) {
      if (!successResponse || typeof successResponse !== 'object' || '$ref' in successResponse) {
        throw new Error(`Unsupported success response definition for ${id}`);
      }
      if (successResponse.content && Object.keys(successResponse.content).some((type) =>
        type !== 'application/json' && !/^application\/[a-z0-9.+-]+\+json$/i.test(type),
      )) throw new Error(`Unsupported response media type for ${id}`);
    }
    tools.push({
      name: id,
      description: entry.operation.summary ?? `${entry.method} ${entry.path}`,
      method: entry.method,
      path: entry.path,
      pathParameters,
      queryParameters,
      bodyProperties,
      inputSchema: { type: 'object', properties, required: [...new Set(required)], additionalProperties: false },
    });
  }
  return tools;
}
