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
  // Journal with snapshots written by the first-pass implementation.
  const snapshotStarted = () => {
    const journal = 'etc/attraccess-wago/docker-provision';
    file(`${journal}/token`, token);
    file(`${journal}/prior`, 'stopped');
    file(`${journal}/os-release`, readFileSync(join(root, 'etc/os-release'), 'utf8'));
    file(`${journal}/dockerd`, readFileSync(join(root, 'etc/init.d/dockerd'), 'utf8'));
    file(`${journal}/start-intent`, '');
    file(`${journal}/started`, '');
    file('daemon', 'running');
  };
  const legacyStarted = () => {
    snapshotStarted();
    // Exact base journal shape: no os-release or dockerd historical snapshots.
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/os-release'));
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/dockerd'));
  };
  const preparedOnly = () => {
    legacyStarted();
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/start-intent'));
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/started'));
    file('daemon', 'stopped');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wago-hardware-fixture-'));
    mkdirSync(join(root, 'bin'));
    for (const [name, path] of Object.entries({
      sh: '/bin/sh',
      cat: '/bin/cat',
      cp: '/bin/cp',
      cmp: '/usr/bin/cmp',
      awk: '/usr/bin/awk',
      od: '/usr/bin/od',
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
    file('etc/os-release', 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"\nVERSION="4.9.1(31)"\n');
    file(WAGO_DIN, '5', 0o400);
    file(WAGO_DOUT, '2', 0o600);
    file('containers.json', '[]');
    file('daemon', 'running');
    file('bin/dockerd', '#!/bin/sh\nexit 99\n', 0o700);
    file(
      'bin/ps',
      '#!/bin/sh\n[ "$FAULT" != ps-failed ] || exit 1\nif [ "$FAULT" = codesys ]; then echo CODESYSControl; fi\nif [ "$FAULT" = docker-info-failed ]; then echo dockerd; fi\n',
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
if (args[0] === 'info') process.exit(process.env.FAULT === 'docker-info-failed' ? 1 : fs.readFileSync(root + '/daemon', 'utf8') === 'running' ? 0 : 1);
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

  it.each(['VERSION_ID="2024.12.0"', 'VERSION_ID="31"\nVERSION="30"', 'VERSION_ID="32"'])(
    'refuses provisioning and runtime installation on ambiguous or unknown firmware: %s',
    (version) => {
      file('etc/os-release', `PTXDIST_PLATFORM_NAME="cc100"\n${version}\n`);
      file('daemon', 'stopped');
      expect(provision().stderr).toContain('unsupported-firmware');
      expect(run(wagoHardwareDeploymentPreflightScript(root)).status).not.toBe(0);
      expect(existsSync(join(root, 'mutations'))).toBe(false);
      expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision'))).toBe(false);
    },
  );

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

  it.each(['file', 'dangling-link'])('preserves a stopped PLC with a configured boot %s', (kind) => {
    file('etc/rc.d/placeholder', '');
    if (kind === 'file') file('etc/rc.d/S98_runtime', '# runtime boot hook\n');
    else symlinkSync('/absent-fixture-runtime', join(root, 'etc/rc.d/S98_runtime'));
    const before = readFileSync(join(root, WAGO_DOUT), 'utf8');
    expect(report().stdout).toContain('exclusivity=codesys-boot-enabled');
    expect(run(wagoHardwareDeploymentPreflightScript(root)).stderr).toContain('codesys-boot-enabled');
    expect(readFileSync(join(root, WAGO_DOUT), 'utf8')).toBe(before);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
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

  it('distinguishes missing binaries and an unavailable daemon without executing an init status action', () => {
    file('daemon', 'stopped');
    expect(report().stdout).toContain(
      'docker=installed-stopped\nconfigDocker=missing\nprovision=unsupported-lifecycle-dependencies',
    );
    expect(report('unknown-status').stdout).toContain('docker=installed-stopped');
    file('etc/docker/daemon.json', '{"data-root":"/home/docker"}');
    expect(report().stdout).toContain('docker=installed-stopped');
    file('var/run/docker.pid', '123');
    expect(report().stdout).toContain('docker=unsupported-tool-state');
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

  it('retains an old start intent even after the daemon stopped and a restored receipt exists', () => {
    snapshotStarted();
    expect(run(wagoDockerProvisionRecoveryScript('b'.repeat(32), root)).status).not.toBe(0);
    expect(recover().stderr).toContain('unresolved-lifecycle-effects');
    file('daemon', 'stopped');
    expect(recover().status).not.toBe(0);
    file('etc/attraccess-wago/docker-provision/restored', '');
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).stderr).toContain('unresolved-lifecycle-effects');
    expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision'))).toBe(true);
  });

  it('reconciles a prepared legacy journal with no start attempt without inventing historical snapshots', () => {
    preparedOnly();
    expect(recover().status).toBe(0);
    const journal = join(root, 'etc/attraccess-wago/docker-provision');
    expect(existsSync(join(journal, 'os-release'))).toBe(false);
    expect(existsSync(join(journal, 'dockerd'))).toBe(false);
    expect(readFileSync(join(journal, 'reconciliation/os-release'), 'utf8')).toBe(
      readFileSync(join(root, 'etc/os-release'), 'utf8'),
    );
    expect(recover().status).toBe(0);
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).status).toBe(0);
    expect(existsSync(journal)).toBe(false);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('retains a legacy activation without fabricating snapshots or treating a running daemon as closure', () => {
    legacyStarted();
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).stderr).toContain('unresolved-lifecycle-effects');
    expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('running');
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('retains legacy reconciliation on a concurrent firmware change', () => {
    preparedOnly();
    expect(recover().status).toBe(0);
    file('etc/os-release', 'changed\n');
    expect(recover().stderr).toContain('Firmware changed');
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).status).not.toBe(0);
    expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision/restored'))).toBe(true);
  });

  it('does not treat a partially missing modern snapshot as a legacy journal', () => {
    snapshotStarted();
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/dockerd'));
    file('daemon', 'stopped');
    expect(recover().stderr).toContain('Incomplete firmware/service context');
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).status).not.toBe(0);
  });

  it.each(['start-failed', 'start-killed'])(
    'does not invoke unclosed vendor start even if it could partially succeed: %s',
    (fault) => {
      file('daemon', 'stopped');
      expect(provision(fault).status).not.toBe(0);
      expect(recover().stderr).toContain('no saved Docker journal');
      expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('stopped');
      expect(existsSync(join(root, 'mutations'))).toBe(false);
    },
  );

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
    preparedOnly();
    file('daemon', 'running');
    file('containers.json', JSON.stringify([{ id: 'external', name: 'external', mounts: [] }]));
    expect(recover().stderr).toContain('workloads exist');
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('does not stop Docker when the workload inspection is unavailable', () => {
    preparedOnly();
    expect(recover('docker-info-failed').stderr).toContain('Cannot inspect Docker workloads');
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('does not claim restoration when an external daemon started before the recorded start intent', () => {
    snapshotStarted();
    rmSync(join(root, 'etc/attraccess-wago/docker-provision/start-intent'));
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision/restored'))).toBe(false);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('does not acknowledge missing-snapshot recovery while a daemon PID file remains', () => {
    file('daemon', 'stopped');
    file('var/run/docker.pid', '123');
    expect(recover().stderr).toContain('no saved Docker journal');
  });

  it('retains successful activation effects without stopping or losing runtime data', () => {
    snapshotStarted();
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).stderr).toContain('unresolved-lifecycle-effects');
    expect(readFileSync(join(root, 'daemon'), 'utf8')).toBe('running');
  });

  it.each(['etc/os-release', 'etc/init.d/dockerd'])('retains recovery when %s changed concurrently', (path) => {
    snapshotStarted();
    file(path, '# changed externally\n');
    expect(recover().stderr).toContain('changed; recovery retained');
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).status).not.toBe(0);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
    expect(existsSync(join(root, 'etc/attraccess-wago/docker-provision'))).toBe(true);
  });

  it('does not consume a restored receipt or stop a daemon restarted by another administrator', () => {
    preparedOnly();
    expect(recover().status).toBe(0);
    file('daemon', 'running');
    expect(recover().stderr).toContain('changed after restoration');
    expect(run(wagoDockerProvisionFinishScript(token, 'restored', root)).status).not.toBe(0);
    expect(existsSync(join(root, 'mutations'))).toBe(false);
  });

  it('does not accept an activation when the daemon has subsequently stopped', () => {
    snapshotStarted();
    file('daemon', 'stopped');
    expect(run(wagoDockerProvisionFinishScript(token, 'accepted', root)).stderr).toContain('unresolved-lifecycle-effects');
    expect(recover().status).not.toBe(0);
  });

  it('emits only the contracted mounts and restrictions', () => {
    const args = wagoHardwareDeploymentDockerArgs();
    expect(args).toContain(`--mount 'type=bind,src=${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly'`);
    expect(args).toContain(`--mount 'type=bind,src=${WAGO_DOUT},dst=/run/attraccess-wago/io/dout'`);
    expect(args).toContain('--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges');
    expect(args).not.toMatch(/--privileged|--device|docker.sock|--user 0/);
  });
});
