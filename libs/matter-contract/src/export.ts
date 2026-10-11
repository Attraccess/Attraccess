import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { schemas, routes } from './registry.js';
import { ERROR_STATUS } from './primitives.js';
import { SUPPORTED_RELEASE } from './release.js';

const output = 'dist/contracts/matter';
const definitions = Object.fromEntries(
  Object.entries(schemas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'draft-2020-12' })]),
);
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string) => ({ 'application/json': { schema: ref(name) } });
const paths: Record<string, unknown> = {};
for (const route of routes) {
  const operational = route.path.startsWith('/v1/');
  const responses: Record<string, unknown> = {
    '200': {
      description:
        'Validated response. Feature responses describe the contract; feature handlers are currently unavailable.',
      content: json(route.response),
    },
  };
  for (const [code, status] of Object.entries(ERROR_STATUS))
    responses[status] = { description: code, content: json('ErrorEnvelope') };
  if (route.path === '/health/ready') responses['503'] = { description: 'Not ready', content: json('ReadyResponse') };
  const headers = schemas.CompatibilityHeaders as typeof import('./release.js').CompatibilityHeaders;
  const parameters = operational
    ? Object.entries(headers.shape).map(([name, schema]) => ({
        name,
        in: 'header',
        required: true,
        schema: z.toJSONSchema(schema),
      }))
    : [];
  paths[route.path] = {
    ...((paths[route.path] as object) ?? {}),
    [route.method.toLowerCase()]: {
      operationId: `${route.method.toLowerCase()}_${route.path.replace(/[^a-z0-9]/gi, '_')}`,
      parameters,
      responses,
      ...('request' in route ? { requestBody: { required: true, content: json(route.request) } } : {}),
      ...('capability' in route
        ? { 'x-required-capability': route.capability, 'x-operationally-available': false }
        : {}),
    },
  };
}
paths['/v1/events'] = {
  get: {
    operationId: 'eventStream',
    parameters: (paths['/v1/capabilities'] as { get: { parameters: unknown } }).get.parameters,
    responses: {
      '101': { description: 'WebSocket upgraded. Send one ClientMessage to resume, receive ServerMessage envelopes.' },
      ...Object.fromEntries(
        Object.entries(ERROR_STATUS).map(([code, status]) => [
          status,
          { description: code, content: json('ErrorEnvelope') },
        ]),
      ),
    },
    'x-websocket': {
      client: ref('ClientMessage'),
      server: ref('ServerMessage'),
      event: ref('EventEnvelope'),
      delivery: 'at_least_once',
      reconciliation: ref('Reconciliation'),
    },
  },
};
mkdirSync(output, { recursive: true });
writeFileSync(
  `${output}/schemas.json`,
  JSON.stringify(
    { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:attraccess:matter:v1', $defs: definitions },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `${output}/openapi.json`,
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Attraccess Matter sidecar',
        version: SUPPORTED_RELEASE.sidecar,
        description:
          'One wire version; exact release coupling. Compatibility headers are metadata, not authentication. Loopback only, browser Origin rejected.',
      },
      paths,
      components: { schemas: definitions },
    },
    null,
    2,
  ) + '\n',
);
