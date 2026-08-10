/**
 * Tests for dnsmasq.js: validation helpers, config generation, settings load,
 * and the secret persistence policy for settings.
 */

jest.mock('child_process', () => ({ spawn: jest.fn() }));

function buildFsMock({ files = {} } = {}) {
  const writes = {};
  const mockFs = {
    readFileSync: jest.fn((p) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFileSync: jest.fn((p, content) => { writes[p] = content; }),
    mkdirSync: jest.fn(),
  };
  return { mockFs, writes };
}

function loadModule(envOverrides = {}, fsOptions) {
  const savedEnv = {};
  for (const key of Object.keys(envOverrides)) {
    savedEnv[key] = process.env[key];
    process.env[key] = envOverrides[key];
  }
  const { mockFs, writes } = buildFsMock(fsOptions);
  jest.doMock('fs', () => mockFs);
  jest.resetModules();
  const mod = require('./dnsmasq');

  const restore = () => {
    for (const key of Object.keys(envOverrides)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  };

  return { mod, writes, mockFs, restore };
}

function invokeHandler(mod, method, subPath, subParts, body) {
  let capturedStatus;
  let capturedJson;
  const helpers = {
    readBody: async () => body || {},
    sendJson: (_res, status, data) => {
      capturedStatus = status;
      capturedJson = data;
    },
    loadJson: jest.fn(),
    saveJson: jest.fn(),
  };
  return mod
    .handleRequest(method, subPath, subParts, null, null, helpers)
    .then(() => ({ status: capturedStatus, body: capturedJson }));
}

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

describe('dnsmasq init generates config + hosts files with sane defaults', () => {
  it('writes /etc/dnsmasq.d/records.conf with upstream, user, no-resolv', () => {
    const { mod, writes, restore } = loadModule({
      DNS_SERVER_ENABLED: 'true',
      DNS_UPSTREAM_1: '1.1.1.1',
      DNS_UPSTREAM_2: '8.8.8.8',
    });
    mod.init();
    restore();

    const confPath = Object.keys(writes).find((p) => p.endsWith('records.conf'));
    expect(confPath).toBeDefined();
    const content = writes[confPath];
    expect(content).toContain('no-resolv');
    expect(content).toContain('server=1.1.1.1');
    expect(content).toContain('server=8.8.8.8');
    expect(content).toContain('addn-hosts=/etc/dnsmasq.d/custom-hosts');
  });

  it('starts dnsmasq with conf-dir limited to *.conf so custom-hosts is not parsed as config', () => {
    const { mod, restore } = loadModule({ DNS_SERVER_ENABLED: 'true' });
    mod.init();
    restore();

    // custom-hosts lives inside the conf-dir; without the ,*.conf filter dnsmasq
    // reads it as a config file and dies with "bad option at line 1".
    const { spawn } = require('child_process');
    expect(spawn).toHaveBeenCalledWith(
      'dnsmasq',
      expect.arrayContaining(['--conf-dir=/etc/dnsmasq.d/,*.conf']),
      expect.anything()
    );
  });

  // loadModule resets modules, so the spawn mock must be grabbed after it.
  function mockSpawnedProcesses() {
    const { spawn } = require('child_process');
    const procs = [];
    spawn.mockImplementation(() => {
      const handlers = {};
      const proc = {
        pid: 100 + procs.length,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        kill: jest.fn(),
        on: (event, cb) => { handlers[event] = cb; },
        emit: (event, arg) => handlers[event](arg),
      };
      procs.push(proc);
      return proc;
    });
    return { spawn, procs };
  }

  it('respawns dnsmasq after an unexpected exit, and stops once shut down', () => {
    // On balena reboot the LAN interface / port 53 isn't ready yet, dnsmasq exits
    // immediately, and without a retry it stayed dead until someone hit Save.
    jest.useFakeTimers();
    const { mod, restore } = loadModule({ DNS_SERVER_ENABLED: 'true', DNS_RESTART_DELAY_MS: '1000' });
    const { spawn, procs } = mockSpawnedProcesses();

    mod.init();
    restore();
    expect(spawn).toHaveBeenCalledTimes(1);

    procs[0].emit('exit', 1);
    jest.advanceTimersByTime(1000);
    expect(spawn).toHaveBeenCalledTimes(2);

    mod.shutdown();
    procs[1].emit('exit', 0);
    jest.advanceTimersByTime(60000);
    expect(spawn).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('retries when spawn reports a failed exec via the async error event', () => {
    // A failed exec (ENOENT, or EAGAIN under boot memory pressure) emits 'error'
    // and no 'exit'. Unhandled, it would kill config-ui instead of retrying.
    jest.useFakeTimers();
    const { mod, restore } = loadModule({ DNS_SERVER_ENABLED: 'true', DNS_RESTART_DELAY_MS: '1000' });
    const { spawn, procs } = mockSpawnedProcesses();

    mod.init();
    restore();

    procs[0].emit('error', new Error('spawn dnsmasq EAGAIN'));
    jest.advanceTimersByTime(1000);
    expect(spawn).toHaveBeenCalledTimes(2);

    mod.shutdown();
    jest.useRealTimers();
  });

  it('survives an EMFILE spawn, where stdio is never created', () => {
    // On EMFILE/ENFILE spawn returns a process with no stdout/stderr but still
    // queues an error emit. Wiring stdio throws, so the error listener has to be
    // attached first or the emit is unhandled and takes config-ui down.
    jest.useFakeTimers();
    const { mod, restore } = loadModule({ DNS_SERVER_ENABLED: 'true', DNS_RESTART_DELAY_MS: '1000' });
    const { spawn, procs } = mockSpawnedProcesses();
    spawn.mockImplementationOnce(() => {
      const handlers = {};
      const proc = {
        pid: undefined,
        stdout: undefined,
        stderr: undefined,
        kill: jest.fn(),
        on: (event, cb) => { handlers[event] = cb; },
        emit: (event, arg) => handlers[event](arg),
      };
      procs.push(proc);
      return proc;
    });

    mod.init();
    restore();

    // Would throw "handlers.error is not a function" if stdio wiring came first.
    expect(() => procs[0].emit('error', new Error('spawn dnsmasq EMFILE'))).not.toThrow();
    jest.advanceTimersByTime(1000);
    expect(spawn).toHaveBeenCalledTimes(2); // one retry, not two

    mod.shutdown();
    jest.useRealTimers();
  });

  it('ignores the exit of a process that a restart already replaced', async () => {
    // The killed process exits only after its replacement is spawned. Acting on
    // that late event would drop the live process and respawn a second dnsmasq.
    jest.useFakeTimers();
    const { mod, restore } = loadModule({ DNS_SERVER_ENABLED: 'true', DNS_RESTART_DELAY_MS: '1000' });
    const { spawn, procs } = mockSpawnedProcesses();

    mod.init();
    await invokeHandler(mod, 'PUT', '/settings', ['settings'], { upstream1: '9.9.9.9' });
    restore();
    expect(spawn).toHaveBeenCalledTimes(2);

    procs[0].emit('exit', null); // old process finally reports its SIGTERM exit
    jest.advanceTimersByTime(60000);

    expect(spawn).toHaveBeenCalledTimes(2);
    // The replacement is still the tracked process, so shutdown reaches it.
    mod.shutdown();
    expect(procs[1].kill).toHaveBeenCalledWith('SIGTERM');

    jest.useRealTimers();
  });

  it('emits listen-address when DNS_LISTEN_ADDRESS is set', () => {
    const { mod, writes, restore } = loadModule({
      DNS_SERVER_ENABLED: 'true',
      DNS_LISTEN_ADDRESS: '127.0.0.1',
    });
    mod.init();
    restore();

    const confPath = Object.keys(writes).find((p) => p.endsWith('records.conf'));
    expect(writes[confPath]).toContain('listen-address=127.0.0.1');
    expect(writes[confPath]).toContain('bind-interfaces');
  });

  it('emits local/domain directives for localDomain and address= for wildcards', () => {
    const { mod, writes, restore } = loadModule(
      {
        DNS_SERVER_ENABLED: 'true',
        DNS_LOCAL_DOMAIN: 'lab.local',
      },
      {
        files: {
          '/data/dns-records.json': JSON.stringify([
            { id: 'a', hostname: '*.wild.example', ip: '10.0.0.5' },
            { id: 'b', hostname: 'host.lab.local', ip: '10.0.0.6' },
          ]),
        },
      },
    );
    mod.init();
    restore();

    const confPath = Object.keys(writes).find((p) => p.endsWith('records.conf'));
    const content = writes[confPath];
    expect(content).toContain('local=/lab.local/');
    expect(content).toContain('domain=lab.local');
    expect(content).toContain('address=/wild.example/10.0.0.5');
  });

  it('skips startup entirely when DNS_SERVER_ENABLED is not truthy', () => {
    const { mod, writes, restore } = loadModule({ DNS_SERVER_ENABLED: 'false' });
    mod.init();
    restore();

    expect(Object.keys(writes)).toHaveLength(0);
  });
});
