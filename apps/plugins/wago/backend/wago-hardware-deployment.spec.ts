import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  WAGO_DIN,
  WAGO_DOUT,
  parseWagoHardwareDeploymentReport,
  wagoDockerProvisionFinishScript,
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionScript,
  wagoHardwareDeploymentDockerArgs,
  wagoHardwareDeploymentPreflightScript,
  wagoHardwareDeploymentReportScript,
} from './wago-hardware-deployment';

describe('hardware deployment shell fixtures (isolated files and fake management tools only)', () => {
  let root: string;
  const token = 'a'.repeat(32);
  const review = { reviewedDockerActivation: true, action: 'start-installed-runtime' as const, token };
  const file = (path: string, content: string, mode = 0o600) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, { mode });
  };
  const run = (script: string, fault = '') =>
    spawnSync('/bin/sh', ['-c', script], {
      encoding: 'utf8',
      timeout: 10000,
      // Deliberately closed PATH: no installed docker, ps, setpriv, or host management tools.
      env: { PATH: join(root, 'bin'), FIXTURE_ROOT: root, FAULT: fault },
    });
  const report = (fault = '') => run(wagoHardwareDeploymentReportScript(root), fault);
  const provision = (fault = '') => run(wagoDockerProvisionScript(review, root), fault);
  const recover = (fault = '') => run(wagoDockerProvisionRecoveryScript(token, root), fault);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wago-hardware-fixture-'));
    mkdirSync(join(root, 'bin'));
    for (const [name, path] of Object.entries({
      sh: '/bin/sh',
      cat: '/bin/cat',
      mkdir: '/bin/mkdir',
      mktemp: '/usr/bin/mktemp',
      mv: '/bin/mv',
      ls: '/bin/ls',
      chmod: '/bin/chmod',
      rm: '/bin/rm',
      touch: '/usr/bin/touch',
      grep: '/usr/bin/grep',
    })) {
      symlinkSync(path, join(root, 'bin', name));
    }
    file('etc/os-release', 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"\n');
    file(WAGO_DIN, '5', 0o400);
    file(WAGO_DOUT, '2', 0o600);
    file('containers.json', '[]');
    file('daemon', 'running');
    file('bin/dockerd', '#!/bin/sh\nexit 99\n', 0o700);
    file(
      'bin/ps',
      '#!/bin/sh\n[ "$FAULT" != ps-failed ] || exit 1\nif [ "$FAULT" = codesys ]; then echo CODESYSControl; fi\n',
      0o700,
    );
    file(
      'bin/readlink',
      `#!${process.execPath}
console.log(require('node:fs').realpathSync(process.argv.at(-1)));
`,
      0o700,
    );
    file(
      'bin/setpriv',
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const expected = ['--reuid=10001', '--regid=10001', '--clear-groups', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all', '--no-new-privs'];
if (!expected.every((flag, index) => args[index] === flag)) process.exit(99);
if (process.env.FAULT === 'setpriv-unsupported') process.exit(127);
if (args.at(-1).includes('id -u')) process.exit(0);
const [din, dout] = args.slice(-2);
for (const path of [din, dout]) if (!path.startsWith(process.env.FIXTURE_ROOT + '/')) process.exit(99);
// Model UID 10001 as owner of these fixture files. No real privilege transitions.
const input = fs.statSync(din), output = fs.statSync(dout);
process.exit(input.isFile() && output.isFile() && (input.mode & 0o400) && (output.mode & 0o600) === 0o600 ? 0 : 1);
`,
      0o700,
    );
    file(
      'bin/flock',
      `#!${process.execPath}
process.exit(process.env.FAULT === 'locked' ? 1 : 0);
`,
      0o700,
    );
    file(
      'bin/docker',
      `#!${process.execPath}
const fs = require('node:fs');
const root = process.env.FIXTURE_ROOT;
const args = process.argv.slice(2);
if (args.shift() !== '--host' || args.shift() !== 'unix:///var/run/docker.sock') process.exit(99);
if (args[0] === 'info') process.exit(fs.readFileSync(root + '/daemon', 'utf8') === 'running' ? 0 : 1);
if (fs.readFileSync(root + '/daemon', 'utf8') !== 'running') process.exit(1);
const containers = JSON.parse(fs.readFileSync(root + '/containers.json', 'utf8'));
if (args[0] === 'container' && args[1] === 'ls') {
  if (process.env.FAULT === 'docker-list-failed') process.exit(1);
  containers.forEach(c => console.log(c.id));
} else if (args[0] === 'inspect') {
  const c = containers.find(c => c.id === args.at(-1));
  if (!c || process.env.FAULT === 'docker-inspect-failed') process.exit(1);
  console.log(args[2] === '{{.Name}}' ? '/' + c.name : c.mounts.join('\\n'));
} else process.exit(99);
`,
      0o700,
    );
    file(
      'etc/init.d/dockerd',
      `#!${process.execPath}
const fs = require('node:fs');
const root = process.env.FIXTURE_ROOT;
const action = process.argv[2];
const state = fs.readFileSync(root + '/daemon', 'utf8');
if (action === 'status') process.exit(process.env.FAULT === 'unknown-status' ? 4 : state === 'running' ? 0 : 3);
fs.appendFileSync(root + '/mutations', action + '\\n');
if (action === 'start') {
  fs.mkdirSync(root + '/var/lib/docker/containers', { recursive: true });
  fs.writeFileSync(root + '/daemon', 'running');
  if (process.env.FAULT === 'start-failed') process.exit(1);
  if (process.env.FAULT === 'start-killed') process.kill(process.ppid, 'SIGKILL');
} else if (action === 'stop') {
  if (process.env.FAULT === 'stop-failed') process.exit(1);
  fs.writeFileSync(root + '/daemon', 'stopped');
} else process.exit(99);
`,
      0o700,
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports read-only software access without changing register bytes or permissions', () => {
    const result = report();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'version=1\nplatform=supported\nhardware=accessible\nexclusivity=clear\ndocker=running\nconfigDocker=missing\nprovision=none\nqualification=required\n',
    );
    expect(parseWagoHardwareDeploymentReport(result.stdout).qualification).toBe('required');
    expect(() =>
      parseWagoHardwareDeploymentReport(result.stdout.replace('hardware=accessible', 'version=1')),
    ).toThrow();
    expect(() => parseWagoHardwareDeploymentReport(result.stdout.trimEnd())).toThrow();
    expect(readFileSync(join(root, WAGO_DIN), 'utf8')).toBe('5');
    expect(readFileSync(join(root, WAGO_DOUT), 'utf8')).toBe('2');
    expect(existsSync(join(root, 'mutations'))).toBe(false);
    expect(existsSync(join(root, 'etc/attraccess-wago'))).toBe(false);
  });

  it('reports unsupported firmware without sourcing os-release', () => {
    file('etc/os-release', 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="30"\ntouch /not-executed\n');
    expect(report().stdout).toContain('platform=unsupported-firmware');
    expect(run(wagoHardwareDeploymentPreflightScript(root)).status).not.toBe(0);
  });

  it.each(['missing', 'directory', 'symlink'])('rejects %s registers without creating a directory', (kind) => {
    rmSync(join(root, WAGO_DOUT));
    if (kind === 'directory') mkdirSync(join(root, WAGO_DOUT));
    if (kind === 'symlink') symlinkSync(join(root, WAGO_DIN), join(root, WAGO_DOUT));
    expect(report().stdout).toContain('hardware=missing-register');
    expect(run(wagoHardwareDeploymentPreflightScript(root)).status).not.toBe(0);
    if (kind === 'missing') expect(existsSync(join(root, WAGO_DOUT))).toBe(false);
  });

  it('checks minimum read and read/write permissions and unsupported privilege tooling', () => {
    chmodSync(join(root, WAGO_DOUT), 0o400);
    expect(report().stdout).toContain('hardware=uid10001-access-denied');
    expect(report('setpriv-unsupported').stdout).toContain('hardware=permission-tool-unavailable');
    rmSync(join(root, 'bin/setpriv'));
    expect(report().stdout).toContain('hardware=permission-tool-unavailable');
  });

  it('rejects CODESYS and query failures rather than treating them as no workload', () => {
    expect(report('codesys').stdout).toContain('exclusivity=codesys-active');
    expect(report('ps-failed').status).not.toBe(0);
    expect(report('docker-list-failed').status).not.toBe(0);
  });

  it.each([WAGO_DOUT, '/sys/kernel', '/sys', '/'])('detects competing stopped containers with bind %s', (source) => {
    file(
      'containers.json',
      JSON.stringify([{ id: 'other', name: 'other', mounts: [source === '/' ? '/' : join(root, source)] }]),
    );
    expect(report().stdout).toContain('exclusivity=output-container-conflict');
    expect(report('docker-inspect-failed').status).not.toBe(0);
  });

  it('allows only the exact predecessor name to be replaced', () => {
    file('containers.json', JSON.stringify([{ id: 'old', name: 'attraccess-wago', mounts: [join(root, WAGO_DOUT)] }]));
    expect(report().stdout).toContain('exclusivity=clear');
  });

  it('distinguishes missing package, installed stopped runtime and unknown service status', () => {
    file('daemon', 'stopped');
    expect(report().stdout).toContain(
      'docker=installed-stopped\nconfigDocker=missing\nprovision=review-start-installed-runtime',
    );
    expect(report('unknown-status').stdout).toContain('docker=unsupported-tool-state');
    rmSync(join(root, 'bin/dockerd'));
    expect(report().stdout).toContain('docker=unsupported-tool-state');
    rmSync(join(root, 'bin/docker'));
    expect(report().stdout).toContain(
      'docker=vendor-package-missing\nconfigDocker=missing\nprovision=unsupported-fw31-package-activation',
    );
  });

  it.each(['etc/docker/daemon.json', 'home/docker/containers', 'var/lib/docker/containers'])(
    'refuses activation with ambiguous storage/workloads: %s',
    (path) => {
      file('daemon', 'stopped');
      file(path, '{}');
      expect(provision().status).not.toBe(0);
      expect(existsSync(join(root, 'mutations'))).toBe(false);
    },
  );

  it('requires explicit review and validates token/action before generating mutations', () => {
    expect(() => wagoDockerProvisionScript({ ...review, reviewedDockerActivation: false })).toThrow(
      'reviewedDockerActivation',
    );
    expect(() => wagoDockerProvisionScript({ ...review, token: 'invalid' })).toThrow('token');
  });

  it('starts only a reviewed stopped runtime, and preserves an idempotent restoration receipt', () => {
    file('daemon', 'stopped');
    expect(provision().status).toBe(0);
    expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('running');
    expect(run(wagoDockerProvisionRecoveryScript('b'.repeat(32), root)).status).not.toBe(0);
    expect(recover().status).toBe(0);
    expect(recover().status).toBe(0);
    expect(readFileSync(join(root, 'mutations'), 'utf8')).toBe('start\nstop\n');
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).status).toBe(0);
    expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision'))).toBe(false);
  });

  it.each(['start-failed', 'start-killed'])('recovers a partial activation: %s', (fault) => {
    file('daemon', 'stopped');
    expect(provision(fault).status).not.toBe(0);
    expect(recover('stop-failed').status).not.toBe(0);
    expect(recover().status).toBe(0);
    expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('stopped');
  });

  it('can activate again after recovery leaves initialized but empty Docker storage', () => {
    file('daemon', 'stopped');
    expect(provision().status).toBe(0);
    expect(recover().status).toBe(0);
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).status).toBe(0);
    expect(existsSync(join(root, 'var/lib/docker/containers'))).toBe(true);
    expect(provision().status).toBe(0);
  });

  it('refuses initialized storage containing container metadata', () => {
    file('daemon', 'stopped');
    file('var/lib/docker/containers/existing/config.v2.json', '{}');
    expect(provision().status).not.toBe(0);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('keeps an already-running daemon unchanged and refuses concurrent delivery/lock conflicts', () => {
    expect(provision().status).not.toBe(0);
    file('daemon', 'stopped');
    expect(provision('locked').status).not.toBe(0);
    file('etc/attraccess-wago/delivery/token', token);
    expect(provision().status).not.toBe(0);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('does not stop Docker when containers appeared after activation', () => {
    file('daemon', 'stopped');
    expect(provision().status).toBe(0);
    file('containers.json', JSON.stringify([{ id: 'external', name: 'external', mounts: [] }]));
    expect(recover().stderr).toContain('workloads exist');
    expect(readFileSync(join(root, 'mutations'), 'utf8')).toBe('start\n');
  });

  it('accepts successful activation without stopping or losing runtime data', () => {
    file('daemon', 'stopped');
    expect(provision().status).toBe(0);
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).status).toBe(0);
    expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('running');
  });

  it('emits only the contracted mounts and restrictions', () => {
    const args = wagoHardwareDeploymentDockerArgs();
    expect(args).toContain(`--mount 'type=bind,src=${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly'`);
    expect(args).toContain(`--mount 'type=bind,src=${WAGO_DOUT},dst=/run/attraccess-wago/io/dout'`);
    expect(args).toContain('--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges');
    expect(args).not.toMatch(/--privileged|--device|docker.sock|--user 0/);
  });
});
