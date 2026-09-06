import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wagoDockerProvisionFinishScript, wagoDockerProvisionRecoveryScript } from './wago-hardware-deployment';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';

/** Verbatim MPL-2.0 WAGO fixture, not a replacement vendor implementation.
 * https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dockerd
 * The complete hash also matches the captured deployed FW31 /etc/init.d/dockerd.
 * Absolute effect paths are relocated before execution; all external management commands are stubbed.
 */
describe('actual WAGO daemon contract, byte-identical in the captured FW31 source', () => {
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
  it.each([false, true])(
    'contains failed-start recovery without restoring vendor namespace effects (snapshots=%s)',
    (snapshots) => {
      const token = 'a'.repeat(32);
      // The real vendor start creates this effect before its failed daemon launch.
      writeFileSync(
        join(root, 'bin/ip'),
        '#!/bin/sh\nif [ "$*" = "netns add WAGO_DOCKER_IPT" ]; then touch "$LOG.namespace"; fi\n',
        { mode: 0o700 },
      );
      for (const [name, status] of [
        ['start-stop-daemon', 17],
        ['docker', 1],
        ['ps', 0],
        ['flock', 0],
      ] as const)
        writeFileSync(join(root, 'bin', name), `#!/bin/sh\nexit ${status}\n`, { mode: 0o700 });
      expect(run('start').status).toBe(0);
      expect(existsSync(join(root, 'calls.namespace'))).toBe(true);
      const fixture = fw31ShellFixture();
      try {
        const journal = join(fixture.root, 'etc/attraccess-wago/docker-provision');
        fixture.file('etc/attraccess-wago/docker-provision/token', token);
        fixture.file('etc/attraccess-wago/docker-provision/prior', 'stopped');
        fixture.file('etc/attraccess-wago/docker-provision/start-intent', '');
        if (snapshots) {
          fixture.file('etc/attraccess-wago/docker-provision/os-release', fixture.read('etc/os-release'));
          fixture.file('etc/attraccess-wago/docker-provision/dockerd', fixture.read('etc/init.d/dockerd'));
        }
        const reconcile = (script: string) => fixture.run(script);
        fixture.file('daemon', 'stopped');
        expect(reconcile(wagoDockerProvisionRecoveryScript(token, fixture.root)).status).not.toBe(0);
        expect(existsSync(join(journal, 'restored'))).toBe(false);
        fixture.file('daemon', 'running');
        const recovery = reconcile(wagoDockerProvisionRecoveryScript(token, fixture.root));
        expect(recovery.status).toBe(0);
        expect(recovery.stdout).toContain('docker-provision=contained');
        expect(existsSync(join(journal, 'restored'))).toBe(true);
        // Cleanup retains ownership checks; vendor networking is intentionally not rolled back.
        expect(reconcile(wagoDockerProvisionFinishScript('b'.repeat(32), 'restored', fixture.root)).status).not.toBe(0);
        expect(existsSync(journal)).toBe(true);
        expect(reconcile(wagoDockerProvisionFinishScript(token, 'restored', fixture.root)).status).toBe(0);
        expect(existsSync(journal)).toBe(false);
        const receipt = `${journal}.completed-${token}`;
        expect(readFileSync(join(receipt, 'token'), 'utf8')).toBe(token);
        expect(reconcile(wagoDockerProvisionRecoveryScript(token, fixture.root)).status).toBe(0);
        expect(reconcile(wagoDockerProvisionFinishScript(token, 'restored', fixture.root)).status).toBe(0);
        expect(existsSync(join(root, 'calls.namespace'))).toBe(true);
      } finally {
        fixture.dispose();
      }
    },
  );
});
