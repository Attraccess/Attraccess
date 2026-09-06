import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { WAGO_DOUT } from './wago-hardware-deployment';
import {
  runtimeBundleAcceptScript,
  runtimeBundleDeliveryScript,
  runtimeBundleInstallScript,
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleRecoveryScript,
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';

const image = 'example.invalid/runtime@sha256:' + 'a'.repeat(64);
const token = 'a'.repeat(32);

describe('destructive runtime shell transaction and signed offline stream fixtures', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const config = 'etc/attraccess-wago';
  const data = 'var/lib/attraccess-wago';
  const tx = 'var/lib/attraccess-wago-install-transaction';
  const install = (fault = '') => fixture.run(runtimeBundleInstallScript(image, fixture.root), fault);
  const recover = (fault = '') => fixture.run(runtimeBundleRecoveryScript(fixture.root), fault);
  const prior = () => {
    fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    fixture.file(data + '/credentials.json', 'revoked-old-fixture-credentials');
    fixture.file(config + '/runtime.env', 'OLD=fixture');
    fixture.file(config + '/runtime-ca.pem', 'old public CA');
  };
  const delivery = () => {
    const bundle = readFileSync(join(fixture.root, 'tmp/attraccess-wago-runtime.tar'));
    return {
      bundle,
      script: runtimeBundleDeliveryScript(
        image,
        'NEW=enrollment',
        'public CA',
        bundle.length,
        createHash('sha256').update(bundle).digest('hex'),
        token,
        fixture.root,
      ),
    };
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(config + '/runtime.env.next', 'NEW=enrollment');
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'fixture image bytes');
    const archive = spawnSync('/usr/bin/tar', [
      '-cf',
      join(fixture.root, 'tmp/attraccess-wago-runtime.tar'),
      '-C',
      join(fixture.root, 'bundle'),
      'image-reference',
      'image.tar',
    ]);
    expect(archive.status).toBe(0);
  });
  afterEach(() => fixture.dispose());

  it('installs a fresh runtime with automatic Docker restarts disabled and gated boot, retaining recovery ownership', () => {
    const r = install();
    expect(r.status).toBe(0);
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ name: 'attraccess-wago', running: true, restart: 'no' }),
    ]);
    expect(fixture.read('docker.log')).toContain('--network host');
    expect(fixture.read(config + '/runtime.env')).toBe('NEW=enrollment');
    expect(statSync(join(fixture.root, config, 'runtime.env')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(fixture.root, config, 'runtime-enabled'))).toBe(true);
    expect(existsSync(join(fixture.root, tx, 'started'))).toBe(true);
  });

  it('discards the old owned container and credentials rather than backing up or restarting them', () => {
    prior();
    expect(install().status).toBe(0);
    expect(fixture.containers().map((c) => c.id)).toEqual(['new-id']);
    expect(existsSync(join(fixture.root, data, 'credentials.json'))).toBe(false);
    expect(existsSync(join(fixture.root, tx, 'data.previous'))).toBe(false);
    expect(existsSync(join(fixture.root, config, 'runtime.env.previous'))).toBe(false);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
    expect(existsSync(join(fixture.root, data))).toBe(false);
    expect(existsSync(join(fixture.root, config, 'runtime-enabled'))).toBe(false);
    expect(fixture.read('docker.log')).not.toMatch(/^start old-id/m);
  });

  it.each(['load', 'inspect-image', 'start', 'supervisor-launch-failed'])(
    'contains %s failures without restoring old workloads',
    (fault) => {
      prior();
      expect(install(fault).status).not.toBe(0);
      expect(fixture.containers()).toEqual([]);
      expect(existsSync(join(fixture.root, config, 'runtime-enabled'))).toBe(false);
      expect(existsSync(join(fixture.root, data))).toBe(false);
      expect(existsSync(join(fixture.root, tx))).toBe(false);
    },
  );

  it('retains interrupted execution until explicit cleanup and never restarts the predecessor', () => {
    prior();
    expect(install('kill').signal).toBe('SIGKILL');
    expect(existsSync(join(fixture.root, tx, 'new-container'))).toBe(true);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(true);
    expect(recover().status).toBe(0);
  });

  it('retains the recovery journal if Docker removal fails, then resumes cleanup safely', () => {
    expect(install().status).toBe(0);
    expect(recover('remove').status).not.toBe(0);
    expect(existsSync(join(fixture.root, tx, 'recovering'))).toBe(true);
    expect(fixture.run(runtimeBundleAcceptScript(fixture.root)).status).not.toBe(0);
    expect(recover().status).toBe(0);
    expect(recover().status).toBe(0);
  });

  it('retains recovery ownership when the daemon is unavailable while its container survives', () => {
    expect(install().status).toBe(0);
    fixture.file('daemon', 'stopped');
    expect(recover().status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(fixture.root, tx, 'recovering'))).toBe(true);
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
    fixture.file('daemon', 'running');
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
  });

  it.each(['stop-failed', 'stop-stuck', 'remove-stuck', 'update-failed', 'docker-inspect-failed'])(
    'retains recovery ownership on %s instead of claiming containment',
    (fault) => {
      expect(install().status).toBe(0);
      expect(recover(fault).status).not.toBe(0);
      expect(fixture.containers()).toHaveLength(1);
      expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
      expect(recover().status).toBe(0);
    },
  );

  it('retains a destructive transaction if its predecessor cannot be contained', () => {
    prior();
    expect(install('update-failed').status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(fixture.root, tx, 'recovering'))).toBe(true);
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
  });

  it('fails before discarding a predecessor if firmware, hardware or the boot gate is unavailable', () => {
    prior();
    expect(install('io-permissions').stderr).toContain('uid10001-access-denied');
    rmSync(join(fixture.root, WAGO_DOUT));
    expect(install().stderr).toContain('missing-register');
    expect(fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(fixture.root, tx))).toBe(false);
  });

  it('requires controller preparation and rejects a newly active PLC', () => {
    fixture.file('plc', 'running');
    expect(install().stderr).toContain('codesys-active');
    fixture.file('plc', 'stopped');
    rmSync(join(fixture.root, 'etc/rc.d/S99_zz_attraccess_wago'));
    expect(install().stderr).toContain('Controller preparation required');
  });

  it('refuses other output containers and query failures, never inferring absence', () => {
    fixture.setContainers([{ id: 'other', name: 'other', running: false, mounts: [join(fixture.root, 'sys')] }]);
    expect(install().stderr).toContain('output-container-conflict');
    expect(install('docker-list-failed').status).not.toBe(0);
    expect(install('docker-info-failed').status).not.toBe(0);
  });

  it('protects the fixed CA outside writable state and discards it on failed enrollment', () => {
    prior();
    fixture.file(config + '/runtime-ca.pem.next', 'new public CA');
    expect(install().status).toBe(0);
    expect(fixture.read(config + '/runtime-ca.pem')).toBe('new public CA');
    expect(statSync(join(fixture.root, config)).mode & 0o777).toBe(0o700);
    expect(statSync(join(fixture.root, config, 'runtime-ca.pem')).mode & 0o777).toBe(0o444);
    expect(fixture.read('docker.log')).toContain(config + '/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro');
    expect(recover().status).toBe(0);
    expect(existsSync(join(fixture.root, config, 'runtime-ca.pem'))).toBe(false);
  });

  it('accepts explicitly, preserves active trust and supports a new destructive enrollment', () => {
    fixture.file(config + '/runtime-ca.pem.next', 'public CA');
    expect(install().status).toBe(0);
    expect(fixture.run(runtimeBundleAcceptScript(fixture.root)).status).toBe(0);
    expect(existsSync(join(fixture.root, tx))).toBe(false);
    expect(fixture.read(config + '/runtime-ca.pem')).toBe('public CA');
    fixture.file(config + '/runtime.env.next', 'NEW=second');
    expect(install().status).toBe(0);
    expect(fixture.containers()).toHaveLength(1);
  });

  it('streams the exact authenticated bundle with token ownership and private staged credentials', () => {
    rmSync(join(fixture.root, config, 'runtime.env.next'));
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    fixture.file(config + '/docker-provision/started', '');
    const { bundle, script } = delivery();
    expect(fixture.run(script, '', bundle).status).toBe(0);
    expect(fixture.read(tx + '/token')).toBe(token + '\n');
    expect(fixture.read(config + '/runtime-ca.pem')).toBe('public CA');
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, 'b'.repeat(32))).status).not.toBe(0);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).status).toBe(0);
    expect(fixture.run(runtimeBundleRecoveryAcknowledgementScript(fixture.root, token)).status).toBe(0);
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
  });

  it.each(['truncated', 'corrupt'])('does not install a %s offline bundle', (fault) => {
    rmSync(join(fixture.root, config, 'runtime.env.next'));
    const { bundle, script } = delivery();
    const bytes = fault === 'truncated' ? bundle.subarray(1) : Buffer.from(bundle);
    if (fault === 'corrupt') bytes[bytes.length - 1] ^= 1;
    expect(fixture.run(script, '', bytes).status).not.toBe(0);
    expect(fixture.containers()).toEqual([]);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).status).toBe(0);
  });

  it('rejects a wrong embedded image reference before discarding existing state', () => {
    prior();
    expect(
      fixture.run(runtimeBundleInstallScript('other.invalid/image@sha256:' + 'b'.repeat(64), fixture.root)).stderr,
    ).toContain('image reference mismatch');
    expect(fixture.containers()[0].id).toBe('old-id');
    expect(fixture.read(data + '/credentials.json')).toBe('revoked-old-fixture-credentials');
  });

  it('recovers interruption before the upload journal exists using exact preparation ownership', () => {
    rmSync(join(fixture.root, config, 'runtime.env.next'));
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).status).toBe(0);
    expect(fixture.read(tx + '.restored/token')).toBe(token + '\n');
    expect(fixture.run(runtimeBundleRecoveryAcknowledgementScript(fixture.root, token)).status).toBe(0);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).status).toBe(0);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, 'b'.repeat(32))).status).not.toBe(0);
  });

  it('does not clear unowned staged configuration after a pre-upload interruption', () => {
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).stderr).toContain('Unowned staged');
    expect(fixture.read(config + '/runtime.env.next')).toBe('NEW=enrollment');
  });

  it('rejects an untrusted preparation journal before using its recovery ownership', () => {
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    fixture.file(
      'owners.json',
      JSON.stringify({
        ...JSON.parse(fixture.read('owners.json')),
        ['/' + config + '/docker-provision']: '10001:10001',
      }),
    );
    const result = fixture.run(runtimeBundleRecoveryScript(fixture.root, token));
    expect(result.stderr).toContain('Unsafe runtime journal ownership');
    expect(fixture.read(config + '/runtime.env.next')).toBe('NEW=enrollment');
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
  });

  it('publishes recovery ownership atomically when interrupted before the receipt rename', () => {
    rmSync(join(fixture.root, config, 'runtime.env.next'));
    fixture.file(config + '/docker-provision/token', token);
    fixture.file(config + '/docker-provision/mode', 'destructive');
    rmSync(join(fixture.root, 'bin/mv'));
    fixture.file(
      'bin/mv',
      `#!${process.execPath}
const args = process.argv.slice(2);
if (process.env.FAULT === 'publish-interrupted' && args.at(-1).endsWith('install-transaction.restored')) {
  process.kill(process.ppid, 'SIGTERM'); process.exit(0);
}
const result = require('node:child_process').spawnSync('/bin/mv', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      0o700,
    );
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token), 'publish-interrupted').status).not.toBe(0);
    expect(existsSync(join(fixture.root, tx + '.restored'))).toBe(false);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).status).toBe(0);
  });

  it('contains valid legacy transactions without restoring their prior container or data', () => {
    fixture.file(tx + '/prepared', '');
    fixture.file(tx + '/old-id', 'old-id\n');
    fixture.file(tx + '/new-container', '');
    fixture.file(tx + '/data-changing', '');
    for (const name of ['old-running', 'had-data', 'had-env', 'had-ca']) fixture.file(tx + '/' + name, 'true');
    fixture.file(tx + '/data.previous/credentials.json', 'old fixture identity');
    fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago.previous', running: false }]);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
    expect(existsSync(join(fixture.root, data))).toBe(false);
  });

  it('retains corrupt metadata and never treats it as permission to delete unowned state', () => {
    expect(install().status).toBe(0);
    fixture.file(tx + '/old-id', 'valid\n../../other\n');
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(fixture.root, tx))).toBe(true);
  });

  it('serializes delivery while a stream is still receiving bytes using real flock', async () => {
    rmSync(join(fixture.root, config, 'runtime.env.next'));
    fixture.file(
      'bin/flock',
      '#!/usr/bin/python3\nimport fcntl,sys\ntry: fcntl.flock(int(sys.argv[2]),fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept OSError: sys.exit(1)\n',
      0o700,
    );
    const { bundle, script } = delivery();
    const child = spawn('/bin/sh', ['-c', script], {
      env: { PATH: join(fixture.root, 'bin'), FIXTURE_ROOT: fixture.root, TMPDIR: join(fixture.root, 'tmp') },
    });
    child.stdout.resume();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const completion = new Promise<number | null>((resolve) => child.on('close', resolve));
    try {
      for (
        let attempt = 0;
        attempt < 300 && !existsSync(join(fixture.root, config, 'delivery/token')) && child.exitCode === null;
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (!existsSync(join(fixture.root, config, 'delivery/token')))
        throw new Error(`Delivery did not reach the locked receiving phase: ${stderr}`);
      expect(fixture.run(runtimeBundleRecoveryScript(fixture.root, token)).stderr).toContain('lock');
      child.stdin.end(bundle);
      expect(await completion).toBe(0);
    } finally {
      child.stdin.destroy();
      if (child.exitCode === null) child.kill('SIGKILL');
      await completion;
    }
  }, 15000);

  it('receiver rejects invalid script encoding and cleans its private directory', () => {
    const r = fixture.run(runtimeBundleStreamReceiver, '', Buffer.from('not-base64!\n'));
    expect(r.status).not.toBe(0);
    expect(fixture.containers()).toEqual([]);
  });
});
