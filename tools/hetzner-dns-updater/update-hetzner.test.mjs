import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import os from 'node:os';
import { createRequire } from 'node:module';
const { getEnvNumber, normalizeName, pickLanIPv4, httpJson, upsertARecord, main } = createRequire(import.meta.url)(
  './update-hetzner.js',
);
const keys = [
  'HETZNER_API_TOKEN',
  'HETZNER_FORCE_IP',
  'HETZNER_DNS_UPDATER_ENABLED',
  'HETZNER_ZONE_ID',
  'HETZNER_RECORD_NAME',
  'HETZNER_TTL',
  'HETZNER_INTERVAL_SECONDS',
  'ATT_TEST_IP',
];
let previous;
beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.HETZNER_API_TOKEN = 'fixture-token';
  mock.method(console, 'log', () => undefined);
  // Every request must be explicitly mocked; no test can contact the DNS service.
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected network request');
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

test('accepts positive numeric settings and falls back for absent or malformed values', () => {
  assert.equal(getEnvNumber('HETZNER_TTL', 300), 300);
  for (const value of ['', 'invalid', '0', '-1', 'Infinity']) {
    process.env.HETZNER_TTL = value;
    assert.equal(getEnvNumber('HETZNER_TTL', 300), 300);
  }
  process.env.HETZNER_TTL = '45.9';
  assert.equal(getEnvNumber('HETZNER_TTL', 300), 45);
});
test('normalizes apex and fully qualified names while preserving relative labels', () => {
  for (const value of ['', '@', 'example.test']) assert.equal(normalizeName(value, 'example.test'), '@');
  assert.equal(normalizeName('host.example.test', 'example.test'), 'host');
  assert.equal(normalizeName('*.host.example.test', 'example.test'), '*.host');
  assert.equal(normalizeName('host', 'example.test'), 'host');
});
test('selects a usable LAN IPv4 and respects valid forced environment references', () => {
  mock.method(os, 'networkInterfaces', () => ({
    absent: undefined,
    loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    invalid: [
      { family: 'IPv6', internal: false, address: '::1' },
      { family: 'IPv4', internal: false, address: '169.254.0.2' },
      { family: 'IPv4', internal: false, address: 'bad' },
    ],
    lan: [{ family: 'IPv4', internal: false, address: '192.168.1.10' }],
  }));
  for (const forced of ['', 'not-an-ip', '${MISSING}', '$$UNRESOLVED']) {
    process.env.HETZNER_FORCE_IP = forced;
    assert.equal(pickLanIPv4(), '192.168.1.10');
  }
  process.env.ATT_TEST_IP = '10.0.0.5';
  for (const forced of ['10.0.0.5', '${ATT_TEST_IP}', '$ATT_TEST_IP']) {
    process.env.HETZNER_FORCE_IP = forced;
    assert.equal(pickLanIPv4(), '10.0.0.5');
  }
  delete process.env.HETZNER_FORCE_IP;
  mock.method(os, 'networkInterfaces', () => ({}));
  assert.equal(pickLanIPv4(), '');
});
test('authenticates JSON requests and reports failed HTTP responses', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ accepted: true }) }));
  assert.deepEqual(
    await httpJson('https://fixture.invalid', {
      method: 'POST',
      headers: { Custom: 'header' },
      body: { value: '10.0.0.1' },
    }),
    { accepted: true },
  );
  const [, options] = fetch.mock.calls[0].arguments;
  assert.equal(options.headers['Auth-API-Token'], 'fixture-token');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers.Custom, 'header');
  assert.equal(options.body, '{"value":"10.0.0.1"}');
  mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    text: async () => 'denied',
  }));
  await assert.rejects(httpJson('https://fixture.invalid'), /HTTP 403 Forbidden: denied/);
  mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 503,
    statusText: 'Unavailable',
    text: async () => {
      throw new Error('broken body');
    },
  }));
  await assert.rejects(httpJson('https://fixture.invalid'), /https:\/\/fixture.invalid/);
});
test('creates missing records, updates changed addresses, and avoids unchanged writes', async () => {
  for (const [records, method] of [
    [[], 'POST'],
    [[{ id: 'r1', value: 'old' }], 'PUT'],
    [[{ id: 'r1', value: '10.0.0.2' }], undefined],
  ]) {
    const requests = [];
    mock.method(globalThis, 'fetch', async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ records }) };
    });
    await upsertARecord('zone', 'host', '10.0.0.2', 120);
    assert.equal(requests.length, method ? 2 : 1);
    if (method) {
      assert.equal(requests[1].options.method, method);
      assert.deepEqual(JSON.parse(requests[1].options.body), {
        zone_id: 'zone',
        name: 'host',
        value: '10.0.0.2',
        ttl: 120,
        type: 'A',
      });
    }
  }
});
test('runs one configured update cycle for the plain and wildcard names', async () => {
  process.env.HETZNER_DNS_UPDATER_ENABLED = 'yes';
  process.env.HETZNER_ZONE_ID = 'zone';
  process.env.HETZNER_RECORD_NAME = '*.host.example.test';
  process.env.HETZNER_FORCE_IP = '10.0.0.2';
  const writes = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.body) writes.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => (url.includes('/zones/') ? { zone: { name: 'example.test' } } : { records: [] }),
    };
  });
  const stop = new Error('stop after cycle');
  mock.method(globalThis, 'setTimeout', () => {
    throw stop;
  });
  await assert.rejects(main(), (error) => error === stop);
  assert.deepEqual(
    writes.map(({ name }) => name),
    ['host', '*.host'],
  );
});
