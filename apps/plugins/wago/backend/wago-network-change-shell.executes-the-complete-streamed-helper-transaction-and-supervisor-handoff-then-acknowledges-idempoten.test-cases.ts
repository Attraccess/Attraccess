import * as fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { networkChangeShell } from './wago-network-change-shell';
import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerExecutesTheCompleteStreamedHelperTransactionAndSupervisorHandoffThenAcknowledgesIdempoten(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('executes the complete streamed helper transaction and supervisor handoff, then acknowledges idempotently', () => {
    const journal = 'var/lib/attraccess-wago-network-transaction';
    fs.rmSync(join(scope.fixture.root, journal), { recursive: true });
    scope.fixture.file('etc/attraccess-wago/install.lock', '');
    scope.fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    scope.fixture.file(
      'owners.json',
      JSON.stringify({ ...JSON.parse(scope.fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
    );
    scope.fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago', running: true, restart: 'no', imageId: scope.image }]);
    scope.original.Id = Buffer.from('old-id').toString('hex').padEnd(64, '0');
    scope.fixture.file('network-container.json', JSON.stringify(scope.original));
    scope.fixture.file(
      'bin/nohup',
      scope.fixture
        .read('bin/nohup')
        .replace(
          'config="$FIXTURE_ROOT/etc/attraccess-wago"',
          '"$1" cycle >/dev/null\nconfig="$FIXTURE_ROOT/etc/attraccess-wago"',
        ),
      0o700,
    );
    fs.renameSync(join(scope.fixture.root, 'bin/docker'), join(scope.fixture.root, 'bin/docker.original'));
    // Execute the fixed production Node program with isolated files and a
    // synthetic Docker API. All other CLI and supervisor checks use FW31 shims.
    scope.fixture.file(
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
    const input = Buffer.from(JSON.stringify(scope.payload)),
      digest = createHash('sha256').update(input).digest('hex');
    const vars = `token=${'a'.repeat(32)}; digest=${digest}; bytes=${input.length};\n`;
    const result = scope.fixture.run(vars + networkChangeShell('apply', scope.fixture.root), '', input);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toBe('OK\n');
    expect(scope.fixture.containers()).toEqual([
      expect.objectContaining({ name: 'attraccess-wago', imageId: scope.image, running: true, restart: 'no' }),
    ]);
    expect(JSON.parse(scope.fixture.read('var/lib/attraccess-wago/state.json')).credentials.password).toBe(scope.payload.password);
    expect(scope.fixture.read('supervisor.log')).toContain('supervise');
    for (let attempt = 0; attempt < 2; attempt++) {
      const ack = scope.fixture.run(vars + networkChangeShell('ack', scope.fixture.root));
      expect({ status: ack.status, stderr: ack.stderr, stdout: ack.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
    }
    expect(fs.existsSync(join(scope.fixture.root, journal))).toBe(false);
  });
}
