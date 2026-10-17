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
    if (name === 'UInt64' || name === 'NodeIdentity') {
      const validateApi = ajv.compile(api.components.schemas[name]);
      for (const ending of ['', '\n', '\r', '\r\n', '\u2028', '\u2029']) {
        const id = 'ffffffffffffffff' + ending;
        const value = name === 'UInt64' ? id : { fabricId: id, nodeId: id };
        const valid = ending === '';
        expect(schemas[name].safeParse(value).success).toBe(valid);
        expect(validate(value)).toBe(valid);
        expect(validateApi(value)).toBe(valid);
      }
    }
    if (name === 'VersionResponse') {
      for (const [release, valid] of [
        ['999.0.0', true],
        ['999.0.0-rc.1', true],
        ['0.1.0--rc.1', true],
        ['0.1.0--', true],
        ['0.1.0-0.a--b.1+001.a-b', true],
        ['0.1.0-01a', true],
        ['0.1.0-01', false],
        ['0.1.0-rc.01', false],
        ['0.1.0-rc..1', false],
        ['0.1.0-rc_1', false],
        ['0.1.0-', false],
        ['01.1.0-rc.1', false],
        ['0.1.0+build.1', true],
        ['0.1.0-rc.1+build.1', true],
        ['0.1.0+001.a-b', true],
        ['0.1.0+', false],
        ['0.1.0+build..1', false],
        ['0.1.0+build.1+extra', false],
        ['0.1.0+build.1\n', false],
        ['not-a-version', false],
        ['', false],
      ] as const) {
        const validateApi = ajv.compile(api.components.schemas.VersionResponse);
        const version = fixtures.VersionResponse as { build: object };
        const value = { ...version, build: { ...version.build, version: release }, sidecarRelease: release };
        expect(schemas.VersionResponse.safeParse(value).success).toBe(valid);
        expect(validate(value)).toBe(valid);
        expect(validateApi(value)).toBe(valid);
      }
    }
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
      const validateApi = ajv.compile(api.components.schemas.OtaRequest);
      expect(doc.$defs.OtaRequest.properties.image.properties.url).toMatchObject({ type: 'string', format: 'uri' });
      for (const [url, valid] of [
        ['https://example.org/update.bin', true],
        ['HTTPS://example.org/update.bin', true],
        ['hTtPs://example.org:8443/update.bin?version=2', true],
        ['https://localhost/update.bin', true],
        ['https://192.0.2.1/update.bin', true],
        ['https://[2001:db8::1]:65535/update.bin', true],
        ['https://[::1]/update.bin', true],
        ['https://[2001:0DB8:0000:0000:0000:0000:0000:0001]/update.bin', true],
        ['https://example.org?version=2', true],
        ['https://user:password@example.org:0/update%20file.bin?q=a%2Fb#release', true],
        ['https://xn--bcher-kva.example/update.bin', true],
        ['http://example.org/update.bin', false],
        ['ftp://example.org/update.bin', false],
        ['file:///update.bin', false],
        ['mailto:firmware@example.org', false],
        ['wss://example.org/update.bin', false],
        ['/update.bin', false],
        ['https://', false],
        ['https:example.org/update.bin', false],
        ['https://:', false],
        ['https://:443/update.bin', false],
        ['https://example.org:invalid/update.bin', false],
        ['https://example.org:bad-port/update.bin', false],
        ['https://example.org:65536/update.bin', false],
        ['https://example.org:99999/update.bin', false],
        ['https://[invalid]/update.bin', false],
        ['https://[not-an-ip]/update.bin', false],
        ['https://[not-ip]/update.bin', false],
        ['https://[2001:db8:::1]/update.bin', false],
        ['https://[broken/update.bin', false],
        ['https://%zz/update.bin', false],
        ['https://exa%zzmple.org/update.bin', false],
        ['https://exa%20mple.org/update.bin', false],
        ['https://exa mple.org/update.bin', false],
        ['https://256.1.1.1/update.bin', false],
        ['https://256.256.256.256/update.bin', false],
        ['https://user@/update.bin', false],
        ['https://example.123/update.bin', false],
        ['https://example.org/update%zz.bin', false],
        ['https://example.org/a b', false],
        ['https://example.org/über.bin', false],
        ['https://bücher.example/update.bin', false],
        ['https://example.org\\update.bin', false],
        ['https://example.org/%', false],
        ['https://example.org/\nfirmware.bin', false],
        [' https://example.org/update.bin', false],
        ['https://example.org/update.bin\n', false],
      ] as const) {
        const value = { ...request, image: { ...request.image, url } };
        expect(schemas.OtaRequest.safeParse(value).success, url).toBe(valid);
        expect(validate(value), url).toBe(valid);
        expect(validateApi(value), url).toBe(valid);
      }
      for (const port of ['0', '1', '65534', '65535', '000443', '65536', '99999', '-1', '1.5']) {
        const value = { ...request, image: { ...request.image, url: `https://example.org:${port}/update.bin` } };
        const valid = /^\d+$/.test(port) && Number(port) <= 65535;
        expect(schemas.OtaRequest.safeParse(value).success, port).toBe(valid);
        expect(validate(value), port).toBe(valid);
        expect(validateApi(value), port).toBe(valid);
      }
      const withoutApprovalId = { ...(fixtures.OtaRequest as Record<string, unknown>) };
      delete withoutApprovalId.approvalId;
      for (const value of [{ ...request, approved: false }, withoutApprovalId]) {
        expect(schemas.OtaRequest.safeParse(value).success).toBe(false);
        expect(validate(value)).toBe(false);
        expect(validateApi(value)).toBe(false);
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
