import { z } from 'zod';
import { WIRE_VERSION } from './constants';
import { capabilityReportSchema } from './capabilities';
import { COMPATIBILITY_TABLE, supportedCombinationSchema } from './compatibility';
import { errorEnvelopeSchema } from './errors';
import { eventEnvelopeSchema } from './events';
import { clientMessageSchema, serverMessageSchema } from './messages';
import { EVENTS_PATH, OPERATIONS, OperationDefinition } from './operations';

type JsonObject = Record<string, unknown>;

const NAMED_SCHEMAS: Record<string, z.ZodType> = {
  ErrorEnvelope: errorEnvelopeSchema,
  CapabilityReport: capabilityReportSchema,
  SupportedCombination: supportedCombinationSchema,
  EventEnvelope: eventEnvelopeSchema,
  ClientMessage: clientMessageSchema,
  ServerMessage: serverMessageSchema,
};

function operationSchemaName(operation: { id: string }, part: 'Params' | 'Request' | 'Response'): string {
  const base = operation.id
    .split(/[.]/)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
  return `${base}${part}`;
}

function collectSchemas(): Record<string, z.ZodType> {
  const all: Record<string, z.ZodType> = { ...NAMED_SCHEMAS };
  for (const operation of OPERATIONS) {
    if (operation.params) all[operationSchemaName(operation, 'Params')] = operation.params;
    if (operation.body) all[operationSchemaName(operation, 'Request')] = operation.body;
    all[operationSchemaName(operation, 'Response')] = operation.response;
  }
  return all;
}

/** Schema documents keyed by name, with `$ref`s pointing at `refPrefix`. Key order is stable. */
export function buildSchemaDefinitions(refPrefix: string): Record<string, JsonObject> {
  const schemas = collectSchemas();
  const registry = z.registry<{ id: string }>();
  for (const name of Object.keys(schemas).sort()) registry.add(schemas[name], { id: name });
  const generated = z.toJSONSchema(registry, {
    uri: (id) => `${refPrefix}${id}`,
    io: 'input',
    unrepresentable: 'any',
  }).schemas as Record<string, JsonObject>;
  const result: Record<string, JsonObject> = {};
  for (const name of Object.keys(generated).sort()) {
    const rest = { ...generated[name] };
    delete rest.$schema;
    delete rest.$id;
    result[name] = rest;
  }
  return result;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorBody = { description: 'Error', content: { 'application/json': { schema: ref('ErrorEnvelope') } } };

type ResponseShape = Pick<OperationDefinition, 'family' | 'versioned' | 'params' | 'body'> & { id: string };

/** The error statuses a route can actually answer with, so generated clients do not expect impossible ones. */
const errorResponses = (operation: ResponseShape): JsonObject => {
  // Any route can refuse a browser origin, miss the path or fail internally.
  const codes = new Set([403, 404, 500]);
  // Release headers are checked, and draining refused, only on versioned routes.
  if (operation.versioned) for (const status of [409, 426, 503]) codes.add(status);
  if (operation.params || operation.body) codes.add(400);
  if (operation.body) codes.add(413);
  // Only feature operations can be unimplemented or run into their deadline.
  if (operation.family !== 'health' && operation.id !== 'events.stream')
    for (const status of [501, 504]) codes.add(status);
  const responses: JsonObject = {};
  for (const status of [...codes].sort()) responses[String(status)] = errorBody;
  // Readiness answers 503 with its own body (starting or draining), not with an error envelope.
  if (operation.id === 'health.ready') {
    responses['503'] = {
      description: 'Not ready',
      content: { 'application/json': { schema: ref(operationSchemaName(operation, 'Response')) } },
    };
  }
  return responses;
};

const COMPAT_PARAMETERS = [
  ['x-matter-wire-version', `Wire protocol version. Only ${WIRE_VERSION} is supported.`],
  ['x-attraccess-version', 'Attraccess release version.'],
  ['x-matter-plugin-version', 'Matter plugin release version.'],
  ['x-matter-sidecar-version', 'Expected Matter sidecar release version.'],
].map(([name, description]) => ({ name, in: 'header', required: true, description, schema: { type: 'string' } }));

function buildPathItem(operation: OperationDefinition): JsonObject {
  const pathParams = Object.keys(operation.params ? pathParamNames(operation.path) : {}).map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  return {
    operationId: operation.id,
    summary: operation.summary,
    tags: [operation.family],
    parameters: [...(operation.versioned ? COMPAT_PARAMETERS : []), ...pathParams],
    ...(operation.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(operationSchemaName(operation, 'Request')) } },
          },
        }
      : {}),
    responses: {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: ref(operationSchemaName(operation, 'Response')) } },
      },
      ...errorResponses(operation),
    },
  };
}

function pathParamNames(path: string): JsonObject {
  const names: JsonObject = {};
  for (const match of path.matchAll(/\{([^}]+)\}/g)) names[match[1]] = true;
  return names;
}

export function buildOpenApiDocument(): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const operation of OPERATIONS) {
    paths[operation.path] = { ...paths[operation.path], [operation.method.toLowerCase()]: buildPathItem(operation) };
  }
  paths[EVENTS_PATH] = {
    get: {
      operationId: 'events.stream',
      summary: 'WebSocket upgrade for the ordered event stream. Messages: ClientMessage / ServerMessage.',
      tags: ['subscriptions'],
      parameters: COMPAT_PARAMETERS,
      responses: {
        '101': { description: 'Switching protocols' },
        ...errorResponses({ id: 'events.stream', family: 'subscriptions', versioned: true }),
      },
    },
  };
  return {
    openapi: '3.1.0',
    info: { title: 'Attraccess Matter sidecar', version: String(WIRE_VERSION) },
    'x-compatibility': COMPATIBILITY_TABLE,
    paths,
    components: { schemas: buildSchemaDefinitions('#/components/schemas/') },
  };
}

export function buildJsonSchemaDocument(): JsonObject {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://attraccess.org/schemas/matter/v1.json',
    $defs: buildSchemaDefinitions('#/$defs/'),
  };
}

export function serializeArtifact(document: JsonObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export { collectSchemas, operationSchemaName };
export type { JsonObject };
