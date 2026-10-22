import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fw31ShellFixture } from '../../backend/fixtures/fw31-shell-fixture';
import { WAGO_DIN, WAGO_DOUT } from '../../backend/host/hardware-deployment';
import type { BuildRuntimeArtifact } from '../../backend/runtime/artifacts/build';
import { managedHostHelper } from '../../backend/runtime/managed/provisioning/helper';
import {
  generateInstallerAuthority,
  managedInstallerPublishScript,
  signInstaller,
} from '../../backend/runtime/managed/provisioning/installer';
import {
  WagoRuntimeUpdateCoordinator,
  RuntimeUpdateError,
  type ManagedRuntimeUpdateHost,
  type RuntimeUpdateRecord,
  type RuntimeUpdateStore,
} from '../../backend/runtime/update/coordinator';

jest.setTimeout(240_000);
const output = process.env.WAGO_ASSURANCE_OUTPUT;
const results: Array<Record<string, unknown>> = [];
afterAll(async () => {
  if (output)
    await writeFile(
      join(output, 'upgrade-recovery.json'),
      JSON.stringify(
        {
          evidenceClass: 'signed-installer-and-production-updater-with-isolated-FW31-interfaces',
          results,
          physicalUpgrade: 'unverified',
        },
        null,
        2,
      ),
    );
});

it.each(['transfer', 'start', 'readiness'] as const)(
  'measures recovery of a signed update after %s failure',
  async (failure) => {
    const fixture = fw31ShellFixture();
    const previousImageId = `sha256:${'c'.repeat(64)}`;
    const imageId = `sha256:${'b'.repeat(64)}`;
    const image = `ghcr.io/attraccess/wago-cc100-runtime@${imageId}`;
    const profile = 'cc100-751-9301-fw31-digital-v1';
    const enrollmentToken = 'a'.repeat(32);
    const authority = generateInstallerAuthority();
    let coordinator: WagoRuntimeUpdateCoordinator | undefined;
    try {
      fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_HARDWARE_ID=enrolled\nWAGO_MQTT_PASSWORD=fixture-secret');
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.file('var/lib/attraccess-wago/credentials.json', 'permanent-fixture-credentials');
      fixture.file('var/lib/attraccess-wago/state.json', 'accepted-revision-1-with-replay-history');
      fixture.file(
        'owners.json',
        JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
      );
      fixture.setContainers([
        {
          id: 'previous',
          name: 'attraccess-wago',
          running: true,
          restart: 'no',
          imageId: previousImageId,
          mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
        },
      ]);
      fixture.file('loaded-image-id', imageId);
      fixture.file('bundle/image-reference', image + '\n');
      fixture.file('bundle/image.tar', 'isolated-image-content');
      const archive = join(fixture.root, 'tmp/update.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(archive);
      const artifact: BuildRuntimeArtifact = {
        buildId: 'a'.repeat(40),
        imageId,
        image,
        digest: createHash('sha256').update(bundle).digest('hex'),
        bytes: bundle.length,
        manifest: {
          schemaVersion: 1,
          runtime: 'attraccess-wago-cc100',
          runtimeVersion: '0.2.0',
          protocolVersion: '1.0.0',
          image,
          hardware: { model: '751-9301', platform: 'linux/arm/v7', firmwareBaseline: '31', profile },
        },
      };
      const helper = managedHostHelper(artifact, fixture.root);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', enrollmentToken);
      fixture.file('etc/attraccess-wago-management/installer-public.pem', authority.publicKey);
      fixture.file('etc/attraccess-wago-management/update-watchdog', '#!/bin/sh\nexit 0\n', 0o700);
      fixture.file('usr/sbin/attraccess-wago-management', '#!/bin/sh\nexit 1\n', 0o700);
      fixture.file('bin/id', "#!/bin/sh\nprintf '0\\n'\n", 0o700);
      fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
      const publish = (key: string) => {
        const signature = signInstaller(key, enrollmentToken, helper);
        return fixture.run(
          `set -eu\numask 077\nPATH='${fixture.root}/bin'; export PATH\nroot='${fixture.root}'; config="$root/etc/attraccess-wago"\nfail() { exit 1; }\ntoken=${enrollmentToken}; digest=${createHash('sha256').update(helper).digest('hex')}; bytes=${Buffer.byteLength(helper)}; image='${signature}'; reference=''; previous=''\n${managedInstallerPublishScript(fixture.root)}`,
          '',
          Buffer.from(helper),
        );
      };
      expect(publish(generateInstallerAuthority().privateKey).status).not.toBe(0);
      expect(publish(authority.privateKey).status).toBe(0);
      expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
      const invoke = (header: string, fault = '', input = Buffer.alloc(0)) => {
        const result = fixture.run(
          `exec /bin/sh '${fixture.root}/usr/sbin/attraccess-wago-management'`,
          fault,
          Buffer.concat([Buffer.from(header + '\n'), input]),
        );
        invocations.push({ header, status: result.status, stderr: result.stderr, stdout: result.stdout });
        return result;
      };
      let row: RuntimeUpdateRecord | null = null;
      let owner: string | undefined;
      const store: RuntimeUpdateStore = {
        acquire: async (_id, next) => {
          if (owner) return false;
          owner = next;
          return true;
        },
        load: async () => row && { ...row },
        save: async (next, currentOwner) => {
          expect(currentOwner).toBe(owner);
          row = { ...next };
          fixture.file('server-update-record.json', JSON.stringify(row));
        },
        release: async () => {
          owner = undefined;
        },
      };
      let failureAt = 0;
      const invocations: Array<{ header: string; status: number | null; stderr: string; stdout: string }> = [];
      const requireSuccess = (result: ReturnType<typeof invoke>) =>
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      const host: ManagedRuntimeUpdateHost = {
        inspect: async () => ({
          imageId: previousImageId,
          runtimeVersion: '0.1.0',
          managed: true,
          claimed: true,
          compatible: true,
          online: true,
        }),
        stage: async (_id, token) => {
          const result = invoke(
            `stage ${token} ${artifact.digest} ${artifact.bytes} ${imageId} ${image}`,
            '',
            failure === 'transfer' ? bundle.subarray(0, 1024) : bundle,
          );
          if (failure === 'transfer') {
            expect(result.status).not.toBe(0);
            failureAt = Date.now();
            throw new RuntimeUpdateError('transfer');
          }
          requireSuccess(result);
        },
        activate: async (_id, token) => {
          const result = invoke(`activate ${token}`, failure === 'start' ? 'start' : '');
          if (failure === 'start') {
            expect(result.status).not.toBe(0);
            failureAt = Date.now();
            throw new RuntimeUpdateError('load');
          }
          requireSuccess(result);
        },
        verify: async () => {
          expect(failure).toBe('readiness');
          failureAt = Date.now();
          // A newly started image without a fresh ready probe must roll back.
          fixture.file('var/lib/attraccess-wago/state.json', 'candidate-state-not-approved');
          return { imageId, permanent: true, ready: false, observedAt: Date.now() };
        },
        accept: async () => {
          throw new Error('Failed candidate must never be accepted');
        },
        recover: async (_id, token, previous) => {
          requireSuccess(invoke(`recover ${token} ${previous}`));
        },
        acknowledge: async (_id, token) => {
          requireSuccess(invoke(`acknowledge ${token}`));
        },
      };
      const started = Date.now();
      coordinator = new WagoRuntimeUpdateCoordinator(
        store,
        async () => artifact,
        host,
        async () => undefined,
      );
      expect(await coordinator.reconcile(1)).toBe('settled');
      expect(invocations.filter((entry) => entry.header.startsWith('recover'))).toEqual([
        expect.objectContaining({ status: 0 }),
      ]);
      const record = JSON.parse(fixture.read('server-update-record.json')) as RuntimeUpdateRecord;
      expect(record).toMatchObject({ phase: 'failed', failure: failure === 'start' ? 'load' : failure, token: null });
      expect(fixture.containers()).toEqual([
        expect.objectContaining({ name: 'attraccess-wago', imageId: previousImageId, running: true }),
      ]);
      expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('accepted-revision-1-with-replay-history');
      expect(fixture.read('var/lib/attraccess-wago/credentials.json')).toBe('permanent-fixture-credentials');
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('fixture-secret');
      results.push({
        exercise: failure,
        outcome: 'passed',
        totalMs: Date.now() - started,
        restorationMs: Date.now() - failureAt,
        artifactDigest: artifact.digest,
        installerSha256: createHash('sha256').update(helper).digest('hex'),
        retained: [
          'prior image',
          'accepted configuration and replay checkpoint',
          'permanent credentials',
          'runtime environment',
        ],
        dataLossBoundary:
          'restored stopped-state checkpoint before activation; unaccepted candidate changes discarded; physical I/O and real SSH unverified',
        boundary:
          'failure detection through coordinator rollback and acknowledgement to prior running image and exact persisted state; host interfaces simulated; signatures and updater code real',
      });
    } finally {
      await coordinator?.stop();
      fixture.dispose();
    }
  },
);
