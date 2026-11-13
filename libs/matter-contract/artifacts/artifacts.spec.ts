import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OPERATIONS } from '../src';
import {
  buildJsonSchemaDocument,
  buildOpenApiDocument,
  collectSchemas,
  operationSchemaName,
  serializeArtifact,
} from '../src/artifacts';

const dir = resolve(__dirname, '../../../dist/contracts/matter');
const openapi = JSON.parse(readFileSync(join(dir, 'openapi.json'), 'utf8'));
const jsonSchema = JSON.parse(readFileSync(join(dir, 'json-schema.json'), 'utf8'));

const id = '11111111-1111-4111-8111-111111111111';
const correlation = { correlationId: id, causationId: null, initiator: { userId: null, requestId: null } };
const event = {
  eventId: id,
  schemaVersion: 1,
  type: 'sidecar.lifecycle',
  timestamp: '2026-10-29T10:00:00.000Z',
  correlation,
  streamInstanceId: id,
  sequence: 1,
  payload: { phase: 'started' },
};

function validatorFor(definitionsPath: string, name: string) {
  const ajv = new Ajv2020({ strict: false, allErrors: false });
  addFormats(ajv);
  const root = definitionsPath === '$defs' ? jsonSchema : { components: openapi.components };
  const prefix = definitionsPath === '$defs' ? '#/$defs/' : '#/components/schemas/';
  ajv.addSchema(root, 'root');
  return (value: unknown) => ({ valid: ajv.validate({ $ref: `root${prefix}${name}` }, value) as boolean });
}

describe('exported artifacts', () => {
  it('are byte-identical across repeated exports and match the files on disk', () => {
    expect(serializeArtifact(buildOpenApiDocument())).toBe(serializeArtifact(buildOpenApiDocument()));
    expect(serializeArtifact(buildOpenApiDocument())).toBe(readFileSync(join(dir, 'openapi.json'), 'utf8'));
    expect(serializeArtifact(buildJsonSchemaDocument())).toBe(readFileSync(join(dir, 'json-schema.json'), 'utf8'));
  });

  it('describe OpenAPI 3.1 with every operation and resolvable references', () => {
    expect(openapi.openapi).toBe('3.1.0');
    for (const operation of OPERATIONS) {
      const pathItem = openapi.paths[operation.path]?.[operation.method.toLowerCase()];
      expect(pathItem?.operationId).toBe(operation.id);
    }
    const refs = [...JSON.stringify(openapi).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const name of refs) expect(openapi.components.schemas[name]).toBeDefined();
    const defRefs = [...JSON.stringify(jsonSchema).matchAll(/"\$ref":"#\/\$defs\/([^"]+)"/g)].map((m) => m[1]);
    for (const name of defRefs) expect(jsonSchema.$defs[name]).toBeDefined();
  });

  it('declare the bearer service token and keep the probes anonymous', () => {
    expect(openapi.components.securitySchemes.serviceToken).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(openapi.security).toEqual([{ serviceToken: [] }]);
    expect(openapi.paths['/health/live'].get.security).toEqual([]);
    expect(openapi.paths['/v1/capabilities'].get.responses['401']).toBeDefined();
  });

  it('keeps schemas small', () => {
    expect(JSON.stringify(jsonSchema).length).toBeLessThan(200_000);
  });

  it.each([['$defs'], ['components']])('agree with runtime schemas on examples (%s)', (where) => {
    const check = (name: string, value: unknown) => validatorFor(where, name)(value).valid;
    expect(check('EventEnvelope', event)).toBe(true);
    expect(check('EventEnvelope', { ...event, timestamp: 'bad' })).toBe(false);
    expect(check('EventEnvelope', { ...event, extra: 1 })).toBe(false);
    const statePayload = {
      nodeId: '5',
      endpointId: 1,
      clusterId: 6,
      attributeId: 0,
      value: true,
      observedAt: '2026-10-29T10:00:00.000Z',
      source: 'read',
    };
    expect(check('EventEnvelope', { ...event, type: 'device.state', payload: statePayload })).toBe(true);
    // The by-type payload check is a runtime refinement; JSON Schema keeps the union with the opaque slot.
    expect(check('EventEnvelope', { ...event, type: 'device.state', payload: 5 })).toBe(false);
    expect(check('DeviceStatePayload', { ...statePayload, fabricId: '1' })).toBe(true);
    expect(check('DeviceStatePayload', { ...statePayload, extra: 1 })).toBe(false);
    const outcomePayload = {
      requestId: id,
      outcome: 'uncertain',
      acceptedAt: '2026-10-29T10:00:00.000Z',
      reportedAt: null,
      fabricId: '1',
      nodeId: '5',
      endpointId: 1,
      failureCode: 'timeout',
    };
    expect(check('CommandOutcomePayload', outcomePayload)).toBe(true);
    expect(check('CommandOutcomePayload', { ...outcomePayload, outcome: 'done' })).toBe(false);
    expect(check('EventEnvelope', { ...event, type: 'command.outcome', payload: outcomePayload })).toBe(true);
    const node = {
      nodeId: '18446744073709551615',
      reachable: true,
      vendorId: 65521,
      productId: 32768,
      vendorName: 'Vendor',
      productName: 'Plug',
      serialNumber: 'SN-1',
      uniqueId: 'U-1',
      hardwareVersion: 1,
      softwareVersion: 2,
      softwareVersionString: '2.0',
      attestation: { status: 'verified', checkedAt: '2026-10-29T10:00:00.000Z' },
      observedAt: '2026-10-29T10:00:00.000Z',
      endpoints: [
        {
          endpointId: 1,
          parentEndpointId: 0,
          deviceTypes: [{ deviceTypeId: 266, revision: 3 }],
          clusters: [
            { clusterId: 6, role: 'server', revision: 6, featureMap: 1, attributeIds: [0], acceptedCommandIds: [0, 1] },
          ],
          bridged: {
            uniqueId: 'B-1',
            nodeLabel: null,
            vendorName: null,
            productName: null,
            serialNumber: null,
            reachable: true,
          },
        },
      ],
    };
    expect(check('InventoryListResponse', { authoritative: true, fabricId: '1', nodes: [node] })).toBe(true);
    const tooManyAttributes = { ...node.endpoints[0].clusters[0], attributeIds: Array.from({ length: 513 }, () => 0) };
    const oversized = { ...node, endpoints: [{ ...node.endpoints[0], clusters: [tooManyAttributes] }] };
    expect(check('InventoryListResponse', { authoritative: true, fabricId: '1', nodes: [oversized] })).toBe(false);
    expect(check('InventoryListResponse', { authoritative: true, fabricId: null, nodes: [] })).toBe(true);
    expect(check('InventoryListResponse', { authoritative: true, nodes: [] })).toBe(false);
    expect(check('ClientMessage', { type: 'resume', wireVersion: 1 })).toBe(true);
    expect(check('ClientMessage', { type: 'resume', wireVersion: 2 })).toBe(false);
    expect(
      check('ErrorEnvelope', {
        error: { code: 'unsupported_wire_version', message: 'x', correlationId: id, retryable: false },
      }),
    ).toBe(true);
    expect(
      check('ErrorEnvelope', { error: { code: 'bogus', message: 'x', correlationId: id, retryable: false } }),
    ).toBe(false);
    expect(check('ServerMessage', { type: 'pong' })).toBe(true);
    expect(
      check('SupportedCombination', {
        wireVersion: 1,
        attraccess: '^1.11.0',
        plugin: '0.1.0',
        sidecar: '0.1.0',
        matterJs: '0.18.0',
      }),
    ).toBe(true);
    expect(
      check('SupportedCombination', {
        wireVersion: 2,
        attraccess: '^1.11.0',
        plugin: '0.1.0',
        sidecar: '0.1.0',
        matterJs: '0.18.0',
      }),
    ).toBe(false);
  });

  it('contain a definition for every operation payload and no secret in any response', () => {
    const schemas = collectSchemas();
    for (const operation of OPERATIONS) {
      expect(schemas[operationSchemaName(operation, 'Response')]).toBeDefined();
      const response = JSON.stringify(openapi.components.schemas[operationSchemaName(operation, 'Response')]);
      expect(response).not.toMatch(/setupCode|activeDataset/);
    }
  });
});
