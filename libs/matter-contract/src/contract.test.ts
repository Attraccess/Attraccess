import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { schemas, routes } from './registry.js';
import { fixtures } from './fixtures.js';
import { EventEnvelope, EventPayload } from './events.js';
import { SUPPORTED_RELEASE, MATTER_JS_RELEASE } from './release.js';

describe('one authoritative Matter contract', () => {
  it('validates every schema and rejects missing/invalid values', () => {
    expect(Object.keys(fixtures).sort()).toEqual(Object.keys(schemas).sort());
    for (const [name, schema] of Object.entries(schemas)) {
      expect(schema.safeParse(fixtures[name]).success, name).toBe(true);
      expect(schema.safeParse(undefined).success, name).toBe(false);
      expect(schema.safeParse({ invalid: true }).success, name).toBe(false);
    }
  });
  it('registers all request/response families', () => {
    for (const route of routes) {
      expect(schemas[route.response]).toBeDefined();
      if ('request' in route) expect(schemas[route.request]).toBeDefined();
    }
    expect(new Set(routes.filter((r) => 'capability' in r).map((r) => r.capability)).size).toBe(7);
  });
  it('rejects inverted subscription intervals and accepts equal and boundary intervals', () => {
    for (const [minIntervalSeconds, maxIntervalSeconds, valid] of [
      [100, 1, false],
      [3600, 1, false],
      [0, 1, true],
      [100, 100, true],
      [3600, 3600, true],
    ]) {
      expect(
        schemas.SubscriptionRequest.safeParse({
          ...(fixtures.SubscriptionRequest as object),
          minIntervalSeconds,
          maxIntervalSeconds,
        }).success,
      ).toBe(valid);
    }
  });
  it('rejects unsafe identifiers, numbers, timestamps, versions, deadlines and missing correlation', () => {
    for (const [name, values] of Object.entries({
      UInt64: [
        1,
        Number('18446744073709551615'),
        '0x123',
        'FFFFFFFFFFFFFFFF',
        '123',
        ...['\n', '\r', '\r\n', '\u2028', '\u2029'].map((end) => 'ffffffffffffffff' + end),
      ],
      Timestamp: ['2026-02-30T00:00:00.000Z', 'today', '2026-01-01T00:00:00+01:00'],
      Id: ['request1'],
      Sequence: [Infinity, NaN, -1, Number.MAX_SAFE_INTEGER + 1],
    }))
      for (const value of values) expect(schemas[name].safeParse(value).success).toBe(false);
    for (const name of ['EventEnvelope', 'ClientMessage', 'VersionResponse', 'ErrorEnvelope'])
      expect(schemas[name].safeParse({ ...(fixtures[name] as object), schemaVersion: 2 }).success).toBe(false);
    const event = structuredClone(fixtures.EventEnvelope) as Record<string, unknown>;
    delete event.correlation;
    expect(EventEnvelope.safeParse(event).success).toBe(false);
    expect(
      schemas.CommandRequest.safeParse({ ...(fixtures.CommandRequest as object), deadline: 'forever' }).success,
    ).toBe(false);
  });
  it('validates every event variant and excludes sensitive material from all reports', () => {
    const payloads: Record<string, string> = {
      lifecycle: '',
      capabilities: 'Capabilities',
      'fabric.status': 'FabricStatus',
      'commissioning.progress': 'CommissioningProgress',
      'commissioning.result': 'OperationResponse',
      'inventory.device': 'Device',
      'command.outcome': 'OperationResponse',
      'subscription.attribute': 'AttributeReport',
      'subscription.event': 'DeviceEventReport',
      'subscription.terminated': 'SubscriptionResponse',
      'thread.status': 'ThreadStatus',
      'ota.progress': 'OtaProgress',
      'ota.outcome': 'OperationResponse',
    };
    for (const [type, name] of Object.entries(payloads)) {
      const payload = name ? fixtures[name] : { state: 'ready' };
      expect(EventPayload.safeParse({ type, payload }).success, type).toBe(true);
      expect(EventEnvelope.safeParse({ ...(fixtures.EventEnvelope as object), type, payload }).success, type).toBe(
        true,
      );
      for (const secret of ['setupCode', 'password', 'dataset', 'fabricSecret', 'credentials']) {
        if (Array.isArray(payload)) continue;
        expect(
          EventPayload.safeParse({ type, payload: { ...(payload as object), [secret]: 'secret' } }).success,
          `${type}:${secret}`,
        ).toBe(false);
      }
    }
    for (const name of [
      'FabricResponse',
      'InventoryResponse',
      'OperationResponse',
      'ThreadStatus',
      'ReadyResponse',
      'VersionResponse',
    ])
      expect(schemas[name].safeParse({ ...(fixtures[name] as object), fabricSecret: 'secret' }).success).toBe(false);
  });
  it('detects release and manifest drift', () => {
    const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
    const plugin = json('apps/plugins/matter/package.json');
    const legacy = json('apps/plugins/matter/plugin.json');
    const sidecar = json('apps/matter-sidecar/package.json');
    expect(SUPPORTED_RELEASE).toEqual({
      attraccess: json('package.json').version,
      plugin: plugin.version,
      sidecar: sidecar.version,
    });
    expect(plugin.attraccess.host).toBe(SUPPORTED_RELEASE.attraccess);
    expect(legacy.attraccessVersion).toEqual({ exact: SUPPORTED_RELEASE.attraccess });
    expect(sidecar.dependencies['@matter/main']).toBe(MATTER_JS_RELEASE);
    expect(sidecar.dependencies['@matter/nodejs']).toBe(MATTER_JS_RELEASE);
    expect(json('package.json').dependencies['@matter/main']).toBe(MATTER_JS_RELEASE);
  });
});
