import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { WAGO_DIN, WAGO_DOUT, wagoCommissioningPreparationScript } from './wago-hardware-deployment';
import {
  runtimeBundleAcceptScript,
  runtimeBundleDeliveryScript,
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleRecoveryScript,
} from './wago-runtime-install';

describe('published runtime boot hook and interrupted journal disposal (isolated FW31 fixture)', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const config = 'etc/attraccess-wago';
  const data = 'var/lib/attraccess-wago';
  const tx = 'var/lib/attraccess-wago-install-transaction';
  const hook = 'etc/rc.d/S99_zz_attraccess_wago';
  const token = 'a'.repeat(32);
  const image = 'example.invalid/runtime@sha256:' + 'a'.repeat(64);
  const exists = (path: string) => existsSync(join(fixture.root, path));

  beforeEach(() => {
    fixture = fw31ShellFixture();
  });
  afterEach(() => fixture.dispose());

  const installNewRuntime = () => {
    fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    fixture.file(data + '/credentials.json', 'revoked fixture credentials');
    fixture.file(config + '/runtime.env', 'OLD=fixture');
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'fixture image bytes');
    expect(
      spawnSync('/usr/bin/tar', [
        '-cf',
        join(fixture.root, 'tmp/attraccess-wago-runtime.tar'),
        '-C',
        join(fixture.root, 'bundle'),
        'image-reference',
        'image.tar',
      ]).status,
    ).toBe(0);
    const bundle = readFileSync(join(fixture.root, 'tmp/attraccess-wago-runtime.tar'));
    const delivery = runtimeBundleDeliveryScript(
      image,
      'NEW=enrollment',
      'accepted public CA',
      bundle.length,
      createHash('sha256').update(bundle).digest('hex'),
      token,
      fixture.root,
    );
    expect(fixture.run(delivery, '', bundle).status).toBe(0);
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ id: 'new-id', name: 'attraccess-wago', running: true, restart: 'no' }),
    ]);
    expect(exists(data + '/credentials.json')).toBe(false);
    expect(exists(tx + '/data.previous')).toBe(false);
  };

  const interruptDisposal = (directory: string, entry: string) => {
    // Unlink the fixture's command symlink before replacing it. Kill only the
    // shell that invoked this shim, after deleting one real journal entry.
    rmSync(join(fixture.root, 'bin/rm'));
    fixture.file(
      'bin/rm',
      `#!${process.execPath}
const fs = require('node:fs'), cp = require('node:child_process');
const root = process.env.FIXTURE_ROOT, args = process.argv.slice(2);
if (args.some(arg => !arg.startsWith('-') && !arg.startsWith(root + '/'))) process.exit(99);
const target = root + '/' + ${JSON.stringify(directory)};
if (process.env.FAULT === 'journal-disposal' && args[0] === '-rf' && args[1] === target) {
  fs.rmSync(target + '/' + ${JSON.stringify(entry)}, { recursive: true });
  process.kill(process.ppid, 'SIGKILL');
  process.exit(1);
}
const result = cp.spawnSync('/bin/rm', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      0o700,
    );
  };

  it('publishes a previously absent boot hook that reapplies IO ownership and checks each boot', () => {
    rmSync(join(fixture.root, hook));
    expect(exists(hook)).toBe(false);
    expect(fixture.run(wagoCommissioningPreparationScript(token, fixture.root)).status).toBe(0);
    const installed = lstatSync(join(fixture.root, hook));
    expect(installed.isFile()).toBe(true);
    expect(installed.nlink).toBe(1);
    expect(installed.mode & 0o777).toBe(0o700);

    // Execute the published file, including its shebang and self-invocation,
    // just as init would. Never regenerate a boot script in this test.
    const boot = () => fixture.run('"$FIXTURE_ROOT/etc/rc.d/S99_zz_attraccess_wago" start');
    fixture.setContainers([{ id: 'new-id', name: 'attraccess-wago', running: false, restart: 'no' }]);
    fixture.file(config + '/runtime-enabled', '');
    fixture.file('owners.json', '{}');
    chmodSync(join(fixture.root, WAGO_DIN), 0o444);
    chmodSync(join(fixture.root, WAGO_DOUT), 0o666);
    expect(boot().status).toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
    expect(JSON.parse(fixture.read('owners.json'))).toMatchObject({
      [WAGO_DIN]: '10001:10001',
      [WAGO_DOUT]: '10001:10001',
    });
    expect(statSync(join(fixture.root, WAGO_DIN)).mode & 0o777).toBe(0o400);
    expect(statSync(join(fixture.root, WAGO_DOUT)).mode & 0o777).toBe(0o600);
    expect(fixture.read(WAGO_DOUT)).toBe('2');

    fixture.setContainers([{ id: 'new-id', name: 'attraccess-wago', running: false, restart: 'no' }]);
    fixture.file('plc', 'running');
    const beforeRejectedBoots = fixture.read('docker.log');
    const plcBoot = boot();
    expect(plcBoot.status).not.toBe(0);
    expect(plcBoot.stderr).toContain('codesys-active');
    expect(exists(config + '/runtime-enabled')).toBe(false);

    fixture.file('plc', 'stopped');
    fixture.file(config + '/runtime-enabled', '');
    rmSync(join(fixture.root, WAGO_DOUT));
    const missingIoBoot = boot();
    expect(missingIoBoot.status).toBe(1);
    expect(fixture.read('docker.log').slice(beforeRejectedBoots.length)).not.toMatch(/^start /m);
    expect(fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(exists(config + '/runtime-enabled')).toBe(false);
  }, 30000);

  it('resumes interrupted recovery disposal and receipt acknowledgement without restoring workloads', () => {
    installNewRuntime();
    const receipt = tx + '.restored';
    const recover = () => runtimeBundleRecoveryScript(fixture.root, token);
    interruptDisposal(receipt + '/bundle', 'image-reference');
    expect(fixture.run(recover(), 'journal-disposal').signal).toBe('SIGKILL');
    expect(exists(tx)).toBe(false);
    expect(exists(receipt + '/bundle/image-reference')).toBe(false);
    expect(exists(receipt + '/bundle/image.tar')).toBe(true);
    expect(fixture.read(receipt + '/token')).toBe(token + '\n');
    expect(fixture.containers()).toEqual([]);
    expect(exists(data)).toBe(false);
    expect(exists(config + '/runtime.env')).toBe(false);
    expect(exists(config + '/runtime-ca.pem')).toBe(false);
    expect(exists(config + '/runtime-enabled')).toBe(false);
    const contained = fixture.read('docker.log');

    expect(fixture.run(recover()).status).toBe(0);
    expect(fixture.run(recover()).status).toBe(0);
    expect(exists(receipt + '/bundle')).toBe(false);
    expect(exists('tmp/attraccess-wago-runtime.tar')).toBe(false);
    expect(exists(config + '/delivery')).toBe(false);

    const acknowledged = receipt + '.acknowledged-' + token;
    const acknowledge = () => runtimeBundleRecoveryAcknowledgementScript(fixture.root, token);
    interruptDisposal(acknowledged, 'token');
    expect(fixture.run(acknowledge(), 'journal-disposal').signal).toBe('SIGKILL');
    expect(exists(receipt)).toBe(false);
    expect(exists(acknowledged + '/token')).toBe(false);
    expect(exists(acknowledged + '/prepared')).toBe(true);
    expect(fixture.run(acknowledge()).status).toBe(0);
    expect(fixture.run(acknowledge()).status).toBe(0);
    expect(exists(acknowledged)).toBe(false);
    expect(fixture.read('docker.log')).toBe(contained);
    expect(fixture.read('docker.log')).not.toMatch(/^start /m);
    expect(fixture.containers()).toEqual([]);
    expect(exists(data)).toBe(false);
  }, 30000);

  it('resumes interrupted acceptance disposal while recovery cannot undo the accepted runtime or trust', () => {
    installNewRuntime();
    const accepted = tx + '.accepted-cleanup';
    const accept = () => runtimeBundleAcceptScript(fixture.root);
    interruptDisposal(accepted, 'prepared');
    const before = fixture.read('docker.log');
    expect(fixture.run(accept(), 'journal-disposal').signal).toBe('SIGKILL');
    expect(exists(tx)).toBe(false);
    expect(exists(accepted + '/prepared')).toBe(false);
    expect(exists(accepted + '/accepting')).toBe(true);
    expect(exists(accepted + '/started')).toBe(true);

    const recovery = fixture.run(runtimeBundleRecoveryScript(fixture.root, token));
    expect(recovery.status).not.toBe(0);
    expect(recovery.stderr).toContain('Acceptance cleanup is pending');
    expect(fixture.read('docker.log')).toBe(before);
    expect(fixture.run(accept()).status).toBe(0);
    expect(exists(accepted)).toBe(false);
    expect(fixture.run(runtimeBundleRecoveryScript(fixture.root)).status).not.toBe(0);
    expect(fixture.read('docker.log')).toBe(before);
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ id: 'new-id', name: 'attraccess-wago', running: true, restart: 'no' }),
    ]);
    expect(fixture.read(data + '/new-state')).toBe('new enrollment state');
    expect(fixture.read(config + '/runtime.env')).toBe('NEW=enrollment');
    expect(fixture.read(config + '/runtime-ca.pem')).toBe('accepted public CA');
    expect(exists(config + '/runtime-enabled')).toBe(true);
    expect(exists(data + '/credentials.json')).toBe(false);
  }, 30000);
});
