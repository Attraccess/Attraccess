import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { createRequire } from 'node:module';
import type { FormatsPlugin } from 'ajv-formats';
const addFormats = createRequire(import.meta.url)('ajv-formats') as FormatsPlugin;
import { schemas, routes } from './registry.js';
import { fixtures } from './fixtures.js';

it('exports deterministic, reference-complete OpenAPI/JSON Schema with runtime-equivalent fixtures', () => {
  const doc = JSON.parse(readFileSync('dist/contracts/matter/schemas.json', 'utf8'));
  const api = JSON.parse(readFileSync('dist/contracts/matter/openapi.json', 'utf8'));
  const before = ['schemas.json', 'openapi.json'].map((name) => readFileSync(`dist/contracts/matter/${name}`, 'utf8'));
  execFileSync(process.execPath, ['dist/contracts/matter/export.mjs']);
  expect(['schemas.json', 'openapi.json'].map((name) => readFileSync(`dist/contracts/matter/${name}`, 'utf8'))).toEqual(
    before,
  );
  expect(api.openapi).toBe('3.1.0');
  expect(Object.keys(doc.$defs).sort()).toEqual(Object.keys(schemas).sort());
  expect(api.components.schemas).toEqual(doc.$defs);
  function checkRefs(value: unknown, root: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref') {
        expect(typeof child).toBe('string');
        expect((child as string).startsWith('#/')).toBe(true);
        const resolved = (child as string)
          .slice(2)
          .split('/')
          .reduce(
            (node: unknown, part) =>
              node && typeof node === 'object'
                ? (node as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')]
                : undefined,
            root,
          );
        expect(resolved, child as string).toBeDefined();
      } else checkRefs(child, root);
    }
  }
  checkRefs(api, api);
  checkRefs(doc, doc);
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  for (const [name, schema] of Object.entries(doc.$defs)) {
    const validate = ajv.compile(schema as object);
    if (name === 'SubscriptionRequest') {
      for (const [minIntervalSeconds, maxIntervalSeconds] of [
        [100, 1],
        [3600, 1],
        [0, 1],
        [100, 100],
        [3600, 3600],
      ]) {
        const request = { ...(fixtures.SubscriptionRequest as object), minIntervalSeconds, maxIntervalSeconds };
        expect(validate(request)).toBe(schemas.SubscriptionRequest.safeParse(request).success);
      }
    }
    if (name === 'OtaRequest') {
      const request = fixtures.OtaRequest as { image: object };
      for (const [url, valid] of [
        ['https://example.org/update.bin', true],
        ['HTTPS://example.org/update.bin', true],
        ['hTtPs://example.org:8443/update.bin?version=2', true],
        ['http://example.org/update.bin', false],
        ['ftp://example.org/update.bin', false],
        ['file:///update.bin', false],
        ['mailto:firmware@example.org', false],
        ['wss://example.org/update.bin', false],
        ['/update.bin', false],
        ['https://', false],
        ['https:example.org/update.bin', false],
      ] as const) {
        const value = { ...request, image: { ...request.image, url } };
        expect(schemas.OtaRequest.safeParse(value).success, url).toBe(valid);
        expect(validate(value), url).toBe(valid);
      }
      const withoutApprovalId = { ...(fixtures.OtaRequest as Record<string, unknown>) };
      delete withoutApprovalId.approvalId;
      for (const value of [{ ...request, approved: false }, withoutApprovalId]) {
        expect(schemas.OtaRequest.safeParse(value).success).toBe(false);
        expect(validate(value)).toBe(false);
      }
    }
    expect(validate(fixtures[name]), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    expect(validate({ invalid: true }), name).toBe(false);
    const value = fixtures[name];
    if (value && typeof value === 'object' && !Array.isArray(value))
      expect(validate({ ...value, unexpected: true }), name).toBe(
        schemas[name].safeParse({ ...value, unexpected: true }).success,
      );
  }
  for (const route of routes)
    expect(
      api.paths[route.path][route.method.toLowerCase()].responses['501'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/ErrorEnvelope');
  expect(api.paths['/v1/events'].get['x-websocket'].client.$ref).toBe('#/components/schemas/ClientMessage');
  expect(api.paths['/v1/events'].get['x-websocket'].errors.application.$ref).toBe('#/components/schemas/ErrorEnvelope');
  expect(api.paths['/v1/events'].get['x-websocket'].errors.payloadLimit).toMatchObject({
    closeCode: 1009,
    envelope: false,
  });
});
