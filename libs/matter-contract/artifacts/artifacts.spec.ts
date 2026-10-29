import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  OPERATIONS,
  buildJsonSchemaDocument,
  buildOpenApiDocument,
  collectSchemas,
  operationSchemaName,
  serializeArtifact,
} from '../src';

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

  it('keeps schemas small', () => {
    expect(JSON.stringify(jsonSchema).length).toBeLessThan(200_000);
  });

  it.each([['$defs'], ['components']])('agree with runtime schemas on examples (%s)', (where) => {
    const check = (name: string, value: unknown) => validatorFor(where, name)(value).valid;
    expect(check('EventEnvelope', event)).toBe(true);
    expect(check('EventEnvelope', { ...event, timestamp: 'bad' })).toBe(false);
    expect(check('EventEnvelope', { ...event, extra: 1 })).toBe(false);
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
