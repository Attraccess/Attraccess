import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wagoDockerProvisionFinishScript, wagoDockerProvisionRecoveryScript } from './wago-hardware-deployment';

/** Verbatim MPL-2.0 WAGO fixture, not a replacement vendor implementation.
 * https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dockerd
 * Absolute effect paths are relocated before execution; all external management commands are stubbed.
 */
describe('actual WAGO FW30 daemon contract (not assumed FW31 compatible)', () => {
  const source = readFileSync(join(__dirname, 'fixtures/fw30-dockerd.sh'), 'utf8');
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wago-vendor-contract-'));
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'events'));
    for (const name of ['ip', 'start-stop-daemon', 'run-parts']) {
      writeFileSync(join(root, 'bin', name), `#!/bin/sh\nprintf '%s\\n' '${name} '"$*" >> "$LOG"\nexit 0\n`, {
        mode: 0o700,
      });
    }
    writeFileSync(
      join(root, 'script'),
      source
        .replace('/etc/config-tools/events/networking', join(root, 'events'))
        .replace('/var/run/docker.pid', join(root, 'pid')),
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const run = (action: string) =>
    spawnSync('/bin/bash', [join(root, 'script'), action], {
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: `${join(root, 'bin')}:/usr/bin:/bin`, LOG: join(root, 'calls') },
    });

  it('pins the entire vendor fixture byte for byte', () => {
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '8cc6533a229fdd7d3dacee8edd4d28b4c43de1a03f071a2224f41a21f869fa37',
    );
  });
  it('status is usage with exit zero, never the previously assumed stopped exit 3', () => {
    const result = run('status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[start|stop|restart]');
  });
  it('start changes the network namespace before spawning the daemon with a wrapper PATH', () => {
    expect(run('start').status).toBe(0);
    const calls = readFileSync(join(root, 'calls'), 'utf8');
    expect(calls).toContain('ip netns add WAGO_DOCKER_IPT');
    expect(calls).toContain('--exec /usr/bin/env PATH=//opt/wago-docker/sbin/');
    expect(calls.indexOf('ip netns add')).toBeLessThan(calls.indexOf('start-stop-daemon -S'));
  });
  it('stop invokes the entire networking event directory, even without a saved daemon PID', () => {
    expect(run('stop').status).toBe(0);
    expect(readFileSync(join(root, 'calls'), 'utf8')).toContain(`run-parts -a config ${join(root, 'events')}`);
  });
  it('masks a daemon start failure with its final echo, requiring independent postconditions', () => {
    writeFileSync(join(root, 'bin/start-stop-daemon'), '#!/bin/sh\nexit 17\n', { mode: 0o700 });
    expect(run('start').status).toBe(0);
  });
  it.each([false, true])('retains failed-start namespace effects and the recovery journal (snapshots=%s)', (snapshots) => {
    const token = 'a'.repeat(32);
    const journal = join(root, 'etc/attraccess-wago/docker-provision');
    mkdirSync(journal, { recursive: true });
    mkdirSync(join(root, 'etc/init.d'), { recursive: true });
    const identity = 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="31"\n';
    writeFileSync(join(root, 'etc/os-release'), identity);
    writeFileSync(join(root, 'etc/init.d/dockerd'), source);
    writeFileSync(join(journal, 'token'), token);
    writeFileSync(join(journal, 'prior'), 'stopped');
    writeFileSync(join(journal, 'start-intent'), '');
    if (snapshots) {
      writeFileSync(join(journal, 'os-release'), identity);
      writeFileSync(join(journal, 'dockerd'), source);
    }
    // The real vendor start creates this effect before its failed daemon launch.
    writeFileSync(join(root, 'bin/ip'), '#!/bin/sh\nif [ "$*" = "netns add WAGO_DOCKER_IPT" ]; then touch "$LOG.namespace"; fi\n', { mode: 0o700 });
    for (const [name, status] of [['start-stop-daemon', 17], ['docker', 1], ['ps', 0], ['flock', 0]] as const)
      writeFileSync(join(root, 'bin', name), `#!/bin/sh\nexit ${status}\n`, { mode: 0o700 });
    expect(run('start').status).toBe(0);
    expect(existsSync(join(root, 'calls.namespace'))).toBe(true);
    const reconcile = (script: string) => spawnSync('/bin/sh', ['-c', script], {
      encoding: 'utf8', timeout: 5000, env: { PATH: `${join(root, 'bin')}:/usr/bin:/bin` },
    });
    const recovery = reconcile(wagoDockerProvisionRecoveryScript(token, root));
    expect(recovery.status).not.toBe(0);
    expect(recovery.stderr).toContain('unresolved-lifecycle-effects');
    expect(existsSync(join(journal, 'restored'))).toBe(false);
    // An old false receipt, including interrupted cleanup, cannot erase the evidence.
    writeFileSync(join(journal, 'restored'), '');
    expect(reconcile(wagoDockerProvisionFinishScript(token, 'restored', root)).status).not.toBe(0);
    expect(existsSync(journal)).toBe(true);
    const cleanup = `${journal}.restored-${token}`;
    renameSync(journal, cleanup);
    expect(reconcile(wagoDockerProvisionFinishScript(token, 'restored', root)).stderr).toContain('unresolved-lifecycle-effects');
    expect(existsSync(cleanup)).toBe(true);
    expect(existsSync(join(root, 'calls.namespace'))).toBe(true);
  });
});
