import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupLegacyPushover } from '../monitoring/grafana/cleanup-legacy-pushover.mjs';

const env = {
  GRAFANA_URL: 'http://grafana:3001/',
  GF_SECURITY_ADMIN_USER: 'admin',
  GF_SECURITY_ADMIN_PASSWORD: 'fixture-password',
  PUSHOVER_API_TOKEN: 'fixture-token',
  PUSHOVER_USER_KEY: 'fixture-user',
};
const legacy = {
  uid: 'efnbnjk6jc8aod',
  name: 'Pushover',
  type: 'pushover',
  provenance: 'file',
  settings: { apiToken: '[REDACTED]', userKey: '[REDACTED]' },
};
const managed = {
  ...legacy,
  uid: 'pushover-attraccess',
  settings: {
    ...legacy.settings,
    title: '{{ template "attraccess.pushover.title" . }}',
    message: '{{ template "attraccess.pushover.message" . }}',
  },
};

function fixture(initialPoints) {
  let points = structuredClone(initialPoints);
  const deleted = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('admin:fixture-password').toString('base64')}`);
    assert.equal(options.headers['X-Grafana-Org-Id'], '1');
    assert.equal(options.redirect, 'error');
    const endpoint = 'http://grafana:3001/api/v1/provisioning/contact-points';
    if (options.method === 'GET') {
      assert.equal(url, endpoint);
      return Response.json(points);
    }
    assert.equal(options.method, 'DELETE');
    const uid = decodeURIComponent(url.slice(endpoint.length + 1));
    assert.ok(points.some((point) => point.uid === uid));
    deleted.push(uid);
    points = points.filter((point) => point.uid !== uid);
    return new Response(null, { status: 202 });
  };
  return { fetchImpl, deleted };
}

test('removes generated legacy UIDs once and preserves managed/custom/unrelated integrations', async () => {
  const { fetchImpl, deleted } = fixture([
    legacy,
    { ...legacy, uid: 'another-generated-uid' },
    managed,
    { ...legacy, uid: 'ui-pushover', provenance: '' },
    { ...legacy, uid: 'api-pushover', provenance: 'api' },
    { ...legacy, uid: 'other-name', name: 'My Pushover' },
    { ...legacy, uid: 'other-type', type: 'email' },
    { ...legacy, uid: 'custom-title', settings: { title: 'Custom title' } },
    { ...legacy, uid: 'custom-message', settings: { message: 'Custom message' } },
  ]);
  assert.equal(await cleanupLegacyPushover({ env, fetchImpl }), 2);
  assert.deepEqual(deleted, ['efnbnjk6jc8aod', 'another-generated-uid']);
  assert.equal(await cleanupLegacyPushover({ env, fetchImpl }), 0);
});

test('does not remove the legacy receiver without the current file-provisioned replacement', async () => {
  for (const replacement of [undefined, { ...managed, provenance: '' }, { ...managed, settings: {} }]) {
    const { fetchImpl, deleted } = fixture([legacy, ...(replacement ? [replacement] : [])]);
    assert.equal(await cleanupLegacyPushover({ env, fetchImpl, attempts: 1 }), 0);
    assert.deepEqual(deleted, []);
  }
});

test('skips all API access when either Pushover secret is missing', async () => {
  for (const key of ['PUSHOVER_API_TOKEN', 'PUSHOVER_USER_KEY']) {
    await cleanupLegacyPushover({ env: { ...env, [key]: '' }, fetchImpl: () => assert.fail('API must not be called') });
  }
});

test('retries connection failures and HTTP unavailability during Grafana startup', async () => {
  const { fetchImpl, deleted } = fixture([legacy, managed]);
  let calls = 0;
  await cleanupLegacyPushover({
    env,
    attempts: 3,
    retryDelayMs: 0,
    fetchImpl: (...args) => {
      calls++;
      if (calls === 1) throw new Error('connection refused');
      if (calls === 2) return new Response(null, { status: 503 });
      return fetchImpl(...args);
    },
  });
  assert.deepEqual(deleted, [legacy.uid]);
});

test('waits for file provisioning after the contact points API is already available', async () => {
  const { fetchImpl, deleted } = fixture([legacy, managed]);
  let reads = 0;
  assert.equal(
    await cleanupLegacyPushover({
      env,
      attempts: 2,
      retryDelayMs: 0,
      fetchImpl: (url, options) => {
        if (options.method === 'GET' && ++reads === 1) return Response.json([legacy]);
        return fetchImpl(url, options);
      },
    }),
    1,
  );
  assert.equal(reads, 2);
  assert.deepEqual(deleted, [legacy.uid]);
});

test('reports unavailable API, authentication and malformed responses without deleting anything', async () => {
  for (const status of [401, 403, 503]) {
    let calls = 0;
    await assert.rejects(
      cleanupLegacyPushover({
        env,
        attempts: 1,
        fetchImpl: (_url, options) => {
          calls++;
          assert.equal(options.method, 'GET');
          return new Response(null, { status });
        },
      }),
      status === 503 ? /did not become available/ : /authentication failed/,
    );
    assert.equal(calls, 1);
  }
  for (const response of [Response.json({}), new Response('invalid json')]) {
    await assert.rejects(cleanupLegacyPushover({ env, fetchImpl: () => response }), /Invalid contact points response/);
  }
});

test('reports failed deletions and tolerates an already removed orphan', async () => {
  for (const status of [403, 404]) {
    const fetchImpl = (_url, options) =>
      options.method === 'GET' ? Response.json([legacy, managed]) : new Response(null, { status });
    if (status === 403) {
      await assert.rejects(cleanupLegacyPushover({ env, fetchImpl }), /Could not delete.*HTTP 403/);
    } else {
      assert.equal(await cleanupLegacyPushover({ env, fetchImpl }), 1);
    }
  }
});
