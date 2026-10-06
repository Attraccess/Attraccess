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

  it('waits for a supervisor gate before staging instead of reporting a transfer failure', () => {
    success(stage('supervisor-lock-held'));
    expect(fixture.read(tx + '/phase')).toBe('staged\n');
    expect(fixture.containers()[0]).toMatchObject({ name: 'attraccess-wago', running: true, imageId: previousImageId });
    expect(fixture.read(data + '/credentials.json')).toBe('permanent-credentials');
  });

  it('expires a busy controller wait before creating an update journal or stopping the runtime', () => {
    const result = stage('lock-wait-expired');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Another runtime transaction holds the controller lock');
    expect(existsSync(join(fixture.root, tx))).toBe(false);
    expect(fixture.containers()[0]).toMatchObject({ running: true, imageId: previousImageId });
  });

  it('loads before stopping, preserves credentials/configuration, and retains the prior runtime until acknowledgement', () => {
    success(stage());
    expect(existsSync(join(fixture.root, tx, 'image.tar'))).toBe(false);
    expect(existsSync(join(fixture.root, tx, 'bundle.tar'))).toBe(false);
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

  it('does not charge the unused temporary filesystem for a direct update transfer', () => {
    fixture.file('bin/df', `#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted on'\ncase "$2" in */tmp) echo 'tmpfs 100 99 1 99% /tmp' ;; *) echo 'disk 999999 0 999999 0% /fixture' ;; esac\n`, 0o700);
    success(stage());
  });

  it('reclaims the retired image only after acceptance is durably acknowledged', () => {
    const unrelatedImage = `sha256:${'e'.repeat(64)}`;
    fixture.file('images.json', JSON.stringify([previousImageId, unrelatedImage]));
    success(stage());
    success(activate());
    success(fixture.run(runtimeUpdateAcceptScript(token, profile, fixture.root)));
    expect(JSON.parse(fixture.read('images.json'))).toContain(previousImageId);
    success(acknowledge());
    success(acknowledge());
    expect(JSON.parse(fixture.read('images.json'))).toEqual([unrelatedImage, imageId]);
    expect(fixture.containers()[0]).toMatchObject({ running: true, imageId });
  });

  it('reclaims a failed loaded candidate after rollback acknowledgement', () => {
    success(stage());
    success(activate());
    success(rollback());
    expect(JSON.parse(fixture.read('images.json'))).toContain(imageId);
    success(acknowledge());
    expect(JSON.parse(fixture.read('images.json'))).toEqual([previousImageId]);
    expect(fixture.containers()[0]).toMatchObject({ running: true, imageId: previousImageId });
  });

  it('retains a retired image still referenced by an unrelated stopped container', () => {
    success(stage());
    success(activate());
    fixture.setContainers([...fixture.containers(), {
      id: 'unrelated', name: 'user-workload', running: false, restart: 'no', imageId: previousImageId,
    }]);
    success(fixture.run(runtimeUpdateAcceptScript(token, profile, fixture.root)));
    success(acknowledge());
    expect(JSON.parse(fixture.read('images.json'))).toContain(previousImageId);
    expect(fixture.containers()).toHaveLength(2);
    expect(fixture.read('docker.log')).not.toContain(`image rm ${previousImageId}`);
  });

  it('resumes acknowledgement after the unused image was removed but before the receipt was removed', () => {
    success(stage());
    success(rollback());
    fixture.file('images.json', JSON.stringify([previousImageId]));
    success(acknowledge());
    expect(fixture.read('docker.log')).not.toContain(`image rm ${imageId}`);
    expect(existsSync(join(fixture.root, tx))).toBe(false);
  });

  it('rejects malformed retired image metadata instead of issuing a Docker removal', () => {
    success(stage());
    success(rollback());
    fixture.file(tx + '/image-id', '--force');
    expect(acknowledge().status).not.toBe(0);
    expect(fixture.read('docker.log')).not.toMatch(/^image rm /m);
    expect(existsSync(join(fixture.root, tx))).toBe(true);
  });

  it.each(['image-remove-failed', 'image-list-failed', 'docker-list-failed', 'docker-inspect-failed'])(
    'retains acknowledgement ownership on %s and retries image cleanup safely', (fault) => {
      success(stage());
      success(rollback());
      const result = fixture.run(runtimeUpdateAcknowledgeScript(token, profile, fixture.root), fault);
      expect(result.status).not.toBe(0);
      expect(existsSync(join(fixture.root, tx))).toBe(true);
      expect(JSON.parse(fixture.read('images.json'))).toEqual([previousImageId, imageId]);
      success(acknowledge());
      expect(JSON.parse(fixture.read('images.json'))).toEqual([previousImageId]);
    },
  );

  it('receives the verified bundle when FW31 head has no byte-count option', () => {
    rmSync(join(fixture.root, 'bin/head'));
    fixture.file('bin/head', '#!/bin/sh\necho "head: invalid option -- c" >&2\nexit 1\n', 0o700);
    success(stage());
  });

  it('does not mistake short dd input blocks for the end of a valid transfer', () => {
    rmSync(join(fixture.root, 'bin/dd'));
    fixture.file('bin/dd', '#!/bin/sh\ncase "$1" in bs=1) if test "$2" = count=8193 && test -e "$FIXTURE_ROOT/var/lib/attraccess-wago-update-transaction/bundle.tar"; then echo capture >> "$FIXTURE_ROOT/receiver-metadata-captures.log"; fi; exec /bin/dd "$@" ;; esac\nsize=${1#bs=}\nif test "$size" -gt 256 && test "$2" = count=1; then exec /bin/dd bs=256 count=1; fi\nexec /bin/dd "$@"\n', 0o700);
    success(stage());
    // Full guarded metadata capture is needed for final validation, not for
    // every short input block of an 80 MiB transfer.
    expect(fixture.read('receiver-metadata-captures.log').trim().split('\n')).toHaveLength(1);
  });

  it('rejects failed image extraction even if Docker accepts the partial input', () => {
    fixture.file('bin/tar', '#!/bin/sh\nif [ "$1" = --version ]; then echo "GNU tar fixture"; exit 0; fi\ncase "$*" in *image.tar*) printf partial; exit 1 ;; esac\nshift 2\nexec /usr/bin/tar "$@"\n', 0o700);
    expect(stage().status).not.toBe(0);
    expect(fixture.containers()[0]).toMatchObject({ running: true, imageId: previousImageId });
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
