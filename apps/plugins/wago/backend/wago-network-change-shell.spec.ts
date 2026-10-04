import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { networkChangeDeviceProgram, networkChangeShell } from './wago-network-change-shell';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';

describe('fixed MQTT recreation program and durable state', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  let original: Record<string, unknown>, current: typeof original | null, created: typeof original | null;
  let requests: string[], interruptCreate: boolean;
  const image = `sha256:${'a'.repeat(64)}`;
  const payload = {
    schema: 1,
    operationToken: 'b'.repeat(32),
    hardwareId: 'cc100-1',
    token: 't'.repeat(43),
    credentialEpoch: '22222222-2222-4222-8222-222222222222',
    username: 'wago-controller-cc100-1',
    password: 'new-password',
    prefix: 'attraccess/wago',
    url: 'mqtts://new-broker.test:8883',
    tlsInsecure: false,
    tlsServername: 'broker.internal',
    caCert: 'new-ca',
  };
  const state = {
    credentials: {
      username: payload.username,
      password: 'old-password',
      prefix: payload.prefix,
      credentialEpoch: 'old-epoch',
    },
    credentialRotation: { revision: 5, token: 'old-token' },
    accepted: { revision: 37, contentHash: 'saved-hash', snapshot: { channels: ['saved-channel'] } },
    outputs: { lamp: true },
    commandIds: ['command-a'],
    sequence: 2000,
    pendingPulseRoutes: [{ point: 'retained-route' }],
    manualOutputChannelIds: ['lamp'],
    uncertainOutputChannelIds: ['pump'],
    futureField: { preserved: true },
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    requests = [];
    created = null;
    interruptCreate = false;
    original = {
      Id: 'c'.repeat(64),
      Image: image,
      State: { Running: false },
      Config: {
        Image: 'original-image-tag',
        User: '10001:10001',
        Cmd: ['node', 'main.cjs'],
        Entrypoint: null,
        Env: [
          'WAGO_HARDWARE_ID=cc100-1',
          'WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-modbus-v1',
          'WAGO_ENROLLMENT_SECRET=preserved-secret',
          'WAGO_PAIRING_CODE=123456',
          'WAGO_MQTT_PASSWORD=old-environment-password',
          'WAGO_MQTT_URL=mqtt://old-broker.test:1883',
          'EXTRA=keep-me',
        ],
        Labels: { installed: 'original' },
        WorkingDir: '/app',
        Volumes: { '/var/lib/attraccess-wago': {} },
      },
      HostConfig: {
        RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
        NetworkMode: 'host',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Devices: [{ PathOnHost: '/dev/ttyRS485', PathInContainer: '/dev/ttyRS485', CgroupPermissions: 'rwm' }],
        Binds: ['/var/lib/attraccess-wago:/var/lib/attraccess-wago', '/custom/cert:/custom/cert:ro'],
        Mounts: [{ Type: 'bind', Source: '/sys/dout', Target: '/run/attraccess-wago/io/dout' }],
        LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } },
      },
      Mounts: [{ Type: 'bind', Source: '/var/lib/attraccess-wago', Destination: '/var/lib/attraccess-wago', RW: true }],
      NetworkSettings: { Networks: {} },
    };
    current = structuredClone(original);
    fixture.file('var/lib/attraccess-wago-network-transaction/container.json', JSON.stringify([original]));
    fixture.file('var/lib/attraccess-wago-network-transaction/payload', JSON.stringify(payload));
    fixture.file('var/lib/attraccess-wago-network-transaction/ca-source', '/etc/attraccess-wago/runtime-ca.pem\n');
    fixture.file('var/lib/attraccess-wago/state.json', JSON.stringify(state));
    fixture.file(
      'etc/attraccess-wago/runtime.env',
      'WAGO_HARDWARE_ID=cc100-1\nWAGO_PAIRING_CODE=123456\nWAGO_ENROLLMENT_SECRET=preserved-secret\nWAGO_MQTT_URL=mqtt://old-broker.test:1883\nWAGO_MQTT_PASSWORD=old-environment-password\nEXTRA=keep-me\n',
    );
  });
  afterEach(() => fixture.dispose());
  async function run() {
    const mockHttp = {
      request: (
        { method, path }: { method: string; path: string },
        callback: (response: EventEmitter & { statusCode?: number }) => void,
      ) => {
        const req = new EventEmitter() as EventEmitter & {
          setTimeout: () => void;
          end: (body: string) => void;
          destroy: () => void;
        };
        req.setTimeout = () => undefined;
        req.destroy = () => undefined;
        req.end = (body) => {
          requests.push(`${method} ${path}`);
          if (method === 'POST' && interruptCreate) {
            setImmediate(() => req.emit('error', new Error('interrupted-create')));
            return;
          }
          const response = Object.assign(new EventEmitter(), { statusCode: 0 });
          let output: unknown;
          if (method === 'GET') {
            response.statusCode = current ? 200 : 404;
            output = current ?? {};
          }
          if (method === 'DELETE') {
            response.statusCode = 204;
            current = null;
          }
          if (method === 'POST') {
            response.statusCode = 201;
            created = JSON.parse(body);
            current = { Id: 'd'.repeat(64), Image: image, Config: created, State: { Running: false } };
            output = { Id: current.Id };
          }
          setImmediate(() => {
            callback(response);
            if (output) response.emit('data', Buffer.from(JSON.stringify(output)));
            response.emit('end');
          });
        };
        return req;
      },
    };
    const code = networkChangeDeviceProgram
      .replace(
        "const tx = '/transaction', config = '/configuration', data = '/data';",
        `const tx = ${JSON.stringify(join(fixture.root, 'var/lib/attraccess-wago-network-transaction'))}, config = ${JSON.stringify(join(fixture.root, 'etc/attraccess-wago'))}, data = ${JSON.stringify(join(fixture.root, 'var/lib/attraccess-wago'))};`,
      )
      .replace(
        "apply().catch(() => { process.stderr.write('MQTT recreation requires recovery\\n'); process.exitCode = 1; });",
        'globalThis.result = apply();',
      );
    const sandbox = {
      require: (name: string) =>
        name === 'node:fs' ? { ...fs, fchownSync: () => undefined } : name === 'node:http' ? mockHttp : require(name),
      Buffer,
      result: undefined as unknown as Promise<void>,
    };
    runInNewContext(code, sandbox);
    await sandbox.result;
  }

  it('recreates the installed image with persistent credentials, preserving state, hardware, mounts, TLS and required environment', async () => {
    await run();
    const saved = JSON.parse(fixture.read('var/lib/attraccess-wago/state.json'));
    expect(saved).toEqual({
      ...state,
      credentials: { ...state.credentials, password: payload.password, credentialEpoch: payload.credentialEpoch },
      credentialRotation: { revision: 1, token: payload.token },
    });
    const spec = created as {
      Image: string;
      Env: string[];
      HostConfig: Record<string, unknown>;
      Cmd: string[];
      Labels: Record<string, string>;
    };
    expect(spec.Image).toBe(image);
    expect(spec.Cmd).toEqual(['node', 'main.cjs']);
    expect(spec.Labels).toMatchObject({
      installed: 'original',
      'io.attraccess.wago.network-token': payload.operationToken,
    });
    expect(spec.HostConfig).toEqual({
      ...(original.HostConfig as object),
      Binds: [
        '/var/lib/attraccess-wago:/var/lib/attraccess-wago',
        '/custom/cert:/custom/cert:ro',
        '/etc/attraccess-wago/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro',
      ],
    });
    expect(spec.Env).toEqual(
      expect.arrayContaining([
        'WAGO_ENROLLMENT_SECRET=preserved-secret',
        'WAGO_PAIRING_CODE=123456',
        'EXTRA=keep-me',
        `WAGO_MQTT_URL=${payload.url}`,
        `WAGO_MQTT_PASSWORD=${payload.password}`,
        'WAGO_MQTT_TLS_SERVERNAME=broker.internal',
        'WAGO_MQTT_USE_ENV_CREDENTIALS=false',
      ]),
    );
    expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain(`WAGO_MQTT_URL=${payload.url}\n`);
    expect(fixture.read('etc/attraccess-wago/runtime-ca.pem')).toBe(payload.caCert);
    expect(requests.map((request) => request.split(' ')[0])).toEqual(['GET', 'DELETE', 'POST']);
    // A reboot/recreation reads permanent credentials from this same persisted
    // state rather than reverting to the earlier environment's enrollment login.
    await run();
    expect(requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
    const rebooted = JSON.parse(fixture.read('var/lib/attraccess-wago/state.json'));
    expect(rebooted.credentials).toEqual({
      ...state.credentials,
      password: payload.password,
      credentialEpoch: payload.credentialEpoch,
    });
    expect(rebooted.accepted).toEqual(state.accepted);
  });

  it('rolls forward after interruption between container deletion and recreation', async () => {
    interruptCreate = true;
    await expect(run()).rejects.toThrow('interrupted');
    expect(current).toBeNull();
    expect(JSON.parse(fixture.read('var/lib/attraccess-wago/state.json')).credentials.password).toBe(payload.password);
    interruptCreate = false;
    await run();
    expect(created).toMatchObject({ Image: image, HostConfig: { RestartPolicy: { Name: 'no' } } });
    expect(JSON.parse(fixture.read('var/lib/attraccess-wago/state.json')).accepted).toEqual(state.accepted);
  });

  it('makes the public broker CA readable by the non-root runtime while keeping credentials private', async () => {
    await run();
    const mode = (path: string) => fs.statSync(join(fixture.root, path)).mode & 0o777;
    expect(mode('etc/attraccess-wago/runtime-ca.pem')).toBe(0o444);
    expect(mode('etc/attraccess-wago/runtime.env')).toBe(0o600);
    expect(mode('var/lib/attraccess-wago/state.json')).toBe(0o600);
  });

  it('rejects a state-file symlink without modifying its target or recreating a container', async () => {
    const statePath = join(fixture.root, 'var/lib/attraccess-wago/state.json');
    fs.renameSync(statePath, statePath + '.saved');
    fs.symlinkSync(statePath + '.saved', statePath);
    await expect(run()).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(statePath + '.saved', 'utf8'))).toEqual(state);
    expect(requests).toEqual([]);
  });

  it('acquires the installation lock, verifies payload integrity before stopping, and starts via the existing supervisor', () => {
    fs.rmSync(join(fixture.root, 'var/lib/attraccess-wago-network-transaction'), { recursive: true });
    fixture.file('etc/attraccess-wago/install.lock', '');
    fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    const input = Buffer.from(JSON.stringify(payload)),
      digest = createHash('sha256').update(input).digest('hex');
    const script =
      `token=${'a'.repeat(32)}; digest=${digest}; bytes=${input.length};\n` + networkChangeShell('apply', fixture.root);
    expect(spawnSync('/bin/sh', ['-n'], { input: script }).status).toBe(0);
    const result = fixture.run(script, '', Buffer.from('invalid'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MQTT payload size mismatch');
    expect(fs.existsSync(join(fixture.root, 'docker.log'))).toBe(false);
    expect(script).toContain('timeout -k 5 310 flock 9');
    expect(script).toContain('launch_runtime_supervisor');
    expect(script).not.toContain('docker restart');
  });

  it('releases only the superseded journal and preserves an interrupted replacement on every retry', () => {
    const journal = 'var/lib/attraccess-wago-network-transaction';
    fixture.file('etc/attraccess-wago/install.lock', '');
    fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    const previous = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const nextPayload = JSON.stringify({
      ...payload,
      operationToken: 'e'.repeat(32),
      url: 'mqtt://corrected.test:1883',
    });
    const next = createHash('sha256').update(nextPayload).digest('hex');
    fixture.file(`${journal}/digest`, previous);
    const release =
      `token=${'a'.repeat(32)}; digest=${previous}; bytes=${next};\n` + networkChangeShell('release', fixture.root);
    for (let i = 0; i < 2; i++) {
      const result = fixture.run(release);
      expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
      expect(fs.existsSync(join(fixture.root, journal))).toBe(false);
    }
    for (const [field, content] of Object.entries({
      digest: next,
      payload: nextPayload,
      'container.json': JSON.stringify([original]),
      'ca-source': '/etc/attraccess-wago/runtime-ca.pem\n',
    }))
      fixture.file(`${journal}/${field}`, content);
    for (let i = 0; i < 2; i++) {
      const result = fixture.run(release);
      expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
      expect(fixture.read(`${journal}/payload`)).toBe(nextPayload);
    }
    fixture.file(`${journal}/digest`, 'f'.repeat(64));
    expect(fixture.run(release).status).not.toBe(0);
    expect(fixture.read(`${journal}/payload`)).toBe(nextPayload);
  });

  it('executes the complete streamed helper transaction and supervisor handoff, then acknowledges idempotently', () => {
    const journal = 'var/lib/attraccess-wago-network-transaction';
    fs.rmSync(join(fixture.root, journal), { recursive: true });
    fixture.file('etc/attraccess-wago/install.lock', '');
    fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.file(
      'owners.json',
      JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
    );
    fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago', running: true, restart: 'no', imageId: image }]);
    original.Id = Buffer.from('old-id').toString('hex').padEnd(64, '0');
    fixture.file('network-container.json', JSON.stringify(original));
    fixture.file(
      'bin/nohup',
      fixture
        .read('bin/nohup')
        .replace(
          'config="$FIXTURE_ROOT/etc/attraccess-wago"',
          '"$1" cycle >/dev/null\nconfig="$FIXTURE_ROOT/etc/attraccess-wago"',
        ),
      0o700,
    );
    fs.renameSync(join(fixture.root, 'bin/docker'), join(fixture.root, 'bin/docker.original'));
    // Execute the fixed production Node program with isolated files and a
    // synthetic Docker API. All other CLI and supervisor checks use FW31 shims.
    fixture.file(
      'bin/docker',
      `#!${process.execPath}
const fs = require('node:fs'), cp = require('node:child_process'), root = process.env.FIXTURE_ROOT, args = process.argv.slice(2);
if (args[2] === 'inspect' && !args.includes('--format')) {
  process.stdout.write(JSON.stringify([JSON.parse(fs.readFileSync(root + '/network-container.json'))]));
} else if (args[2] === 'run' && args.includes('--entrypoint')) {
  const program = fs.readFileSync(0, 'utf8').replace("const tx = '/transaction', config = '/configuration', data = '/data';",
    'const tx=' + JSON.stringify(root + '/${journal}') + ', config=' + JSON.stringify(root + '/etc/attraccess-wago') + ', data=' + JSON.stringify(root + '/var/lib/attraccess-wago') + ';');
  const prelude = ${JSON.stringify(String.raw`
const fixtureFs = require('node:fs'), fixtureHttp = require('node:http'), fixtureEvents = require('node:events');
const fixtureRoot = process.env.FIXTURE_ROOT;
fixtureFs.fchownSync = () => {};
fixtureHttp.request = (options, callback) => {
  const req = new fixtureEvents.EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
  req.end = body => {
    const path = fixtureRoot + '/containers.json', containers = JSON.parse(fixtureFs.readFileSync(path)), original = JSON.parse(fixtureFs.readFileSync(fixtureRoot + '/network-container.json'));
    const c = containers.find(c => c.name === 'attraccess-wago'); let code = 0, output = null;
    if (options.method === 'GET') {
      code = c ? 200 : 404;
      if (c) output = { ...original, Id: Buffer.from(c.id).toString('hex').padEnd(64, '0'), State: { Running: c.running },
        Config: c.networkToken ? JSON.parse(fixtureFs.readFileSync(fixtureRoot + '/network-create-spec.json')) : original.Config };
    }
    if (options.method === 'DELETE') { code = 204; fixtureFs.writeFileSync(path, '[]'); }
    if (options.method === 'POST') {
      const spec = JSON.parse(body); code = 201; output = { Id: 'new-id' };
      fixtureFs.writeFileSync(fixtureRoot + '/network-create-spec.json', body);
      fixtureFs.writeFileSync(path, JSON.stringify([{ id: 'new-id', name: 'attraccess-wago', imageId: spec.Image, running: false, restart: 'no', networkToken: spec.Labels['io.attraccess.wago.network-token'] }]));
    }
    setImmediate(() => { const res = Object.assign(new fixtureEvents.EventEmitter(), { statusCode: code }); callback(res);
      if (output) res.emit('data', Buffer.from(JSON.stringify(output))); res.emit('end'); });
  }; return req;
};
`)};
  const result = cp.spawnSync(process.execPath, ['-e', prelude + program], { env: process.env, stdio: 'inherit' });
  process.exitCode = result.status;
} else {
  const result = cp.spawnSync(root + '/bin/docker.original', args, { env: process.env, stdio: 'inherit' }); process.exitCode = result.status;
}
`,
      0o700,
    );
    const input = Buffer.from(JSON.stringify(payload)),
      digest = createHash('sha256').update(input).digest('hex');
    const vars = `token=${'a'.repeat(32)}; digest=${digest}; bytes=${input.length};\n`;
    const result = fixture.run(vars + networkChangeShell('apply', fixture.root), '', input);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toBe('OK\n');
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ name: 'attraccess-wago', imageId: image, running: true, restart: 'no' }),
    ]);
    expect(JSON.parse(fixture.read('var/lib/attraccess-wago/state.json')).credentials.password).toBe(payload.password);
    expect(fixture.read('supervisor.log')).toContain('supervise');
    for (let attempt = 0; attempt < 2; attempt++) {
      const ack = fixture.run(vars + networkChangeShell('ack', fixture.root));
      expect({ status: ack.status, stderr: ack.stderr, stdout: ack.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
    }
    expect(fs.existsSync(join(fixture.root, journal))).toBe(false);
  });
});
