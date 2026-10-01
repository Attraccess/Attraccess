import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  runtimeUpdateStageScript,
  runtimeUpdateActivateScript,
  runtimeUpdateAcceptScript,
  runtimeUpdateRollbackScript,
  runtimeUpdateAcknowledgeScript,
} from './wago-runtime-update-shell';
import { runtimeBundleInstallScript } from './wago-runtime-install';
import { WAGO_DIN, WAGO_DOUT, wagoRuntimeBootScript } from './wago-hardware-deployment';

const token = 'a'.repeat(32);
const imageId = `sha256:${'b'.repeat(64)}`;
const previousImageId = `sha256:${'c'.repeat(64)}`;
const image = `ghcr.io/attraccess/wago-cc100-runtime@${imageId}`;
const profile = 'cc100-751-9301-fw31-digital-v1';

describe('state-preserving update shell (isolated FW31 interfaces)', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  let artifact: BuildRuntimeArtifact;
  let bundle: Buffer;
  const config = 'etc/attraccess-wago';
  const data = 'var/lib/attraccess-wago';
  const tx = 'var/lib/attraccess-wago-update-transaction';
  const stage = (fault = '', input = bundle) =>
    fixture.run(runtimeUpdateStageScript(artifact, token, fixture.root), fault, input);
  const activate = (fault = '') => fixture.run(runtimeUpdateActivateScript(token, profile, fixture.root), fault);
  const rollback = () => fixture.run(runtimeUpdateRollbackScript(token, profile, previousImageId, fixture.root));
  const acknowledge = () => fixture.run(runtimeUpdateAcknowledgeScript(token, profile, fixture.root));
  const success = (result: ReturnType<typeof fixture.run>) =>
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });

  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(
      'etc/rc.d/S99_zz_attraccess_wago',
      fixture.read('etc/rc.d/S99_zz_attraccess_wago') + '\n# previous-build-hook\n',
      0o700,
    );
    fixture.file(config + '/runtime.env', 'WAGO_HARDWARE_ID=enrolled\nWAGO_MQTT_PASSWORD=permanent-fixture-secret');
    fixture.file(config + '/runtime-enabled', '');
    fixture.file(data + '/credentials.json', 'permanent-credentials');
    fixture.file(data + '/state.json', 'accepted-configuration');
    fixture.file(
      'owners.json',
      JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), ['/var/lib/attraccess-wago']: '10001:10001' }),
    );
    fixture.setContainers([
      {
        id: 'old-id',
        name: 'attraccess-wago',
        running: true,
        restart: 'no',
        imageId: previousImageId,
        mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
      },
    ]);
    fixture.file('loaded-image-id', imageId);
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'compressed fixture image bytes');
    const archive = join(fixture.root, 'tmp/update.tar');
    expect(
      spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
        .status,
    ).toBe(0);
    bundle = readFileSync(archive);
    artifact = {
      imageId,
      image,
      buildId: 'a'.repeat(40),
      digest: createHash('sha256').update(bundle).digest('hex'),
      bytes: bundle.length,
      manifest: {
        schemaVersion: 1,
        runtime: 'attraccess-wago-cc100',
        runtimeVersion: '0.1.0',
        protocolVersion: '1.0.0',
        image,
        hardware: { model: '751-9301', platform: 'linux/arm/v7', firmwareBaseline: '31', profile },
      },
    };
  });
  afterEach(() => fixture.dispose());

  it('loads before stopping, preserves credentials/configuration, and retains the prior runtime until acknowledgement', () => {
    success(stage());
    expect(fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toContain('previous-build-hook');
    expect(fixture.containers()[0].running).toBe(true);
    expect(fixture.read(tx + '/phase')).toBe('staged\n');
    success(activate());
    expect(fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toBe(wagoRuntimeBootScript(fixture.root, profile));
    expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
    expect(fixture.read(data + '/state.json')).toBe('accepted-configuration');
    expect(fixture.read(config + '/runtime.env')).toContain('permanent-fixture-secret');
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ id: 'old-id', name: 'attraccess-wago.previous', running: false }),
      expect.objectContaining({ name: 'attraccess-wago', running: true, imageId }),
    ]);
    expect(fixture.read('docker.log')).toContain(`--env WAGO_RUNTIME_IMAGE_ID=${imageId}`);
    success(fixture.run(runtimeUpdateAcceptScript(token, profile, fixture.root)));
    expect(existsSync(join(fixture.root, tx, 'state.previous'))).toBe(true);
    success(acknowledge());
    success(acknowledge());
    expect(fixture.containers()).toHaveLength(1);
    expect(existsSync(join(fixture.root, tx))).toBe(false);
  });

  it('restores the prior container and its stopped-state checkpoint after readiness failure or reboot', () => {
    success(stage());
    success(activate());
    fixture.file(data + '/state.json', 'incompatible-new-state');
    // The transaction is entirely on disk; a fresh recovery invocation needs no
    // live connection, bootstrap password or coordinator memory.
    success(rollback());
    success(rollback());
    expect(fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toContain('previous-build-hook');
    expect(fixture.read(data + '/state.json')).toBe('accepted-configuration');
    expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
    expect(fixture.containers()).toEqual([
      expect.objectContaining({ id: 'old-id', name: 'attraccess-wago', running: true }),
    ]);
    success(acknowledge());
  });

  it.each(['load', 'storage', 'inspect-image'])(
    'leaves the current runtime untouched on staging %s failure',
    (fault) => {
      expect(stage(fault).status).not.toBe(0);
      expect(fixture.containers()[0]).toMatchObject({ id: 'old-id', running: true });
      expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
      expect(fixture.read('docker.log')).not.toMatch(/^stop /m);
      success(rollback());
      success(acknowledge());
    },
  );

  it.each(['truncated', 'oversized', 'checksum'])('rejects %s transfers before loading', (fault) => {
    const input =
      fault === 'truncated'
        ? bundle.subarray(0, 1024)
        : fault === 'oversized'
          ? Buffer.concat([bundle, Buffer.alloc(512)])
          : Buffer.alloc(bundle.length);
    expect(stage('', input).status).not.toBe(0);
    expect(fixture.read('docker.log')).not.toContain('load -i');
    expect(fixture.containers()[0].running).toBe(true);
    success(rollback());
    success(acknowledge());
  });

  it('checks Docker identity/platform rather than trusting the tar reference', () => {
    fixture.file('loaded-image-id', `sha256:${'d'.repeat(64)}`);
    expect(stage().status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it.each(['start', 'kill', 'supervisor-launch-failed'])(
    'recovers a failed or interrupted %s without reenrollment',
    (fault) => {
      success(stage());
      const result = activate(fault);
      expect(result.status).not.toBe(0);
      success(rollback());
      expect(fixture.containers()).toEqual([expect.objectContaining({ id: 'old-id', running: true })]);
      expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
    },
  );

  it('serializes staging against destructive commissioning and rejects a foreign update token', () => {
    success(stage());
    const commissioning = fixture.run(runtimeBundleInstallScript(image, fixture.root));
    expect(commissioning.status).not.toBe(0);
    expect(commissioning.stderr).toContain('Managed runtime update');
    const foreign = fixture.run(runtimeUpdateActivateScript('f'.repeat(32), profile, fixture.root));
    expect(foreign.status).not.toBe(0);
    expect(foreign.stderr).toContain('Foreign update');
    expect(fixture.containers()[0].running).toBe(true);
  });

  it('resumes partial cleanup without requiring metadata already deleted by the interrupted cleanup', () => {
    success(stage());
    success(rollback());
    const cleanup = join(fixture.root, `var/lib/attraccess-wago-update-cleanup-${token}`);
    renameSync(join(fixture.root, tx), cleanup);
    rmSync(join(cleanup, 'token'));
    expect(stage().status).not.toBe(0);
    success(acknowledge());
    expect(existsSync(cleanup)).toBe(false);
    expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
  });

  it('rejects mounted state before staging because checkpoint restore must be an atomic rename', () => {
    fixture.file(
      'proc/self/mountinfo',
      `1 0 0:1 / / rw - ext4 fixture rw\n2 1 0:1 / ${fixture.root}/${data} rw - ext4 bind rw\n`,
    );
    const result = stage();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Mounted runtime state');
    expect(fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(fixture.root, tx))).toBe(false);
  });
});
