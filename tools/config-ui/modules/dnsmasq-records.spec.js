const { loadModule, invokeHandler } = require('./dnsmasq.test-utils');
jest.mock('child_process', () => ({ spawn: jest.fn() }));
afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('dnsmasq settings endpoint', () => {
  it('GET /settings returns env-backed defaults when no settings file exists', async () => {
    const { mod, restore } = loadModule({
      DNS_UPSTREAM_1: '9.9.9.9',
      DNS_UPSTREAM_2: '8.8.4.4',
      DNS_LOCAL_DOMAIN: 'lab.local',
      DNS_LOG_QUERIES: 'true',
    });

    const { status, body } = await invokeHandler(mod, 'GET', '/settings', []);
    restore();

    expect(status).toBe(200);
    expect(body).toEqual({
      upstream1: '9.9.9.9',
      upstream2: '8.8.4.4',
      localDomain: 'lab.local',
      logQueries: true,
    });
  });

  it('PUT /settings persists only the expected keys and returns the updated settings', async () => {
    const { mod, writes, restore } = loadModule({});
    const { status, body } = await invokeHandler(mod, 'PUT', '/settings', [], {
      upstream1: '1.0.0.1',
      localDomain: 'corp.internal',
      logQueries: true,
    });
    restore();

    expect(status).toBe(200);
    expect(body.upstream1).toBe('1.0.0.1');
    expect(body.localDomain).toBe('corp.internal');
    expect(body.logQueries).toBe(true);

    const settingsPath = Object.keys(writes).find((p) => p.endsWith('dns-settings.json'));
    const parsed = JSON.parse(writes[settingsPath]);
    expect(parsed.upstream1).toBe('1.0.0.1');
    expect(parsed.localDomain).toBe('corp.internal');
    expect(parsed.logQueries).toBe(true);
  });
});

describe('dnsmasq records endpoint validation', () => {
  it('rejects invalid hostnames with 400', async () => {
    const { mod, restore } = loadModule({});
    const { status, body } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: 'not a host!',
      ip: '10.0.0.1',
    });
    restore();

    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid/i);
  });

  it('rejects invalid IPs with 400', async () => {
    const { mod, restore } = loadModule({});
    const { status, body } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: 'host.local',
      ip: '999.999.999.999',
    });
    restore();

    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid/i);
  });

  it('accepts valid hostname + IPv4 and persists a record with a UUID', async () => {
    const { mod, writes, restore } = loadModule({});
    const { status, body } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: 'host.local',
      ip: '10.0.0.1',
    });
    restore();

    expect(status).toBe(201);
    expect(body.hostname).toBe('host.local');
    expect(body.ip).toBe('10.0.0.1');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const recordsPath = Object.keys(writes).find((p) => p.endsWith('dns-records.json'));
    expect(recordsPath).toBeDefined();
    const parsed = JSON.parse(writes[recordsPath]);
    expect(parsed).toHaveLength(1);
  });

  it('accepts wildcard hostnames (*.domain)', async () => {
    const { mod, restore } = loadModule({});
    const { status, body } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: '*.internal.lab',
      ip: '10.0.0.1',
    });
    restore();

    expect(status).toBe(201);
    expect(body.hostname).toBe('*.internal.lab');
  });

  it('accepts IPv6 addresses (requires colon, not bare hex)', async () => {
    const { mod, restore } = loadModule({});
    const { status } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: 'v6.local',
      ip: '2001:db8::1',
    });
    restore();

    expect(status).toBe(201);
  });

  it('rejects a colon-less hex blob as IP', async () => {
    const { mod, restore } = loadModule({});
    const { status } = await invokeHandler(mod, 'POST', '/records', [], {
      hostname: 'bad.local',
      ip: 'deadbeef',
    });
    restore();

    expect(status).toBe(400);
  });

  it('DELETE /records/:id returns 404 for unknown ids', async () => {
    const { mod, restore } = loadModule({});
    const { status } = await invokeHandler(mod, 'DELETE', '/records/no-such-id', ['records', 'no-such-id']);
    restore();

    expect(status).toBe(404);
  });
});

describe('updating DNS records', () => {
  const record = { id: 'existing', hostname: 'old.local', ip: '192.0.2.1' };
  it.each([
    [{ hostname: 'bad host' }, 400, 'invalid hostname'],
    [{ ip: '999.1.1.1' }, 400, 'invalid ip'],
    [{ hostname: 'new.local', ip: '192.0.2.2' }, 200, undefined],
    [{}, 200, undefined],
  ])('validates and persists updates %j', async (update, expectedStatus, error) => {
    const { mod, writes, restore } = loadModule({}, { files: { '/data/dns-records.json': JSON.stringify([record]) } });
    try {
      const response = await invokeHandler(mod, 'PUT', '/records/existing', ['records', 'existing'], update);
      expect(response.status).toBe(expectedStatus);
      if (error) {
        expect(response.body.error).toBe(error);
        expect(writes['/data/dns-records.json']).toBeUndefined();
      } else {
        expect(response.body).toEqual({ ...record, ...update });
        expect(JSON.parse(writes['/data/dns-records.json'])).toEqual([{ ...record, ...update }]);
      }
    } finally {
      restore();
    }
  });
  it('rejects updates for a missing record', async () => {
    const { mod, restore } = loadModule();
    try {
      expect((await invokeHandler(mod, 'PUT', '/records/missing', ['records', 'missing'], {})).status).toBe(404);
    } finally {
      restore();
    }
  });
});
