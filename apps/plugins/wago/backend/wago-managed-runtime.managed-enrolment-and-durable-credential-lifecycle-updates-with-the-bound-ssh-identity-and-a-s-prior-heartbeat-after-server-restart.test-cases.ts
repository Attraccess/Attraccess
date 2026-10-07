import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh } from './wago-managed-ssh';
import { managedHostHelper } from './wago-managed-helper';
import { createHash } from 'node:crypto';
import { signInstaller, MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleUpdatesWithTheBoundSshIdentityAndASPriorHeartbeatAfterServerRestart(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it.each(['fresh', 'stale', 'missing'] as const)(
    'updates with the bound SSH identity and a %s prior heartbeat after server restart',
    async (priorHeartbeat) => {
      await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
      const now = new Date().toISOString();
      const current = await scope.db.getRepository(WagoController).save(
        Object.assign(new WagoController(), {
          id: 1,
          hardwareId: 'cc100-1',
          trustState: 'claimed',
          mqttServerId: 7,
          pairingCodeHash: 'fixture',
          protocolVersion: '1',
          runtimeVersion: '1',
          capabilities: '[]',
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      for (const [id, state] of [
        [1, 'completed'],
        [2, 'awaiting_confirmation'],
      ] as const)
        await scope.db.getRepository(WagoCommissioningSession).save(
          Object.assign(scope.session(id), {
            hardwareId: current.hardwareId,
            mqttServerId: 7,
            firmwareBaseline: '31',
            state,
            initiatingPrincipal: JSON.stringify(scope.principal),
            auditLog: '[]',
            createdAt: now,
            updatedAt: now,
          }),
        );
      await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
      const envelope = (
        await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1')
      )[0].encrypted_credentials;
      const credentials = JSON.parse(scope.decrypt(envelope));
      await scope.service.onModuleDestroy();
      let heartbeat: Parameters<WagoService['registerRuntimeStatusHandler']>[0] = () => undefined;
      let boot = '00000000-0000-4000-8000-000000000001';
      let sequence = 1;
      let policyConfirmed = false;
      const restarted = new WagoManagedRuntimeService(
        scope.service['context'],
        {
          registerRuntimeStatusHandler: (handler) => {
            heartbeat = handler;
          },
          setRuntimePolicy: async (_id: number, desired: string, observed: string) => {
            policyConfirmed = desired === observed;
          },
          getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
        } as WagoService,
        {
          current: async () => scope.artifact,
          acquire: async () => ({ path: '/mock/build-owned-bundle', cleanup: jest.fn() }),
        } as unknown as WagoRuntimeArtifactsService,
        {
          observe: () => ({
            timestamp: Date.now(),
            streamId: boot,
            sequence,
            revision: 1,
            contentHash: 'a'.repeat(64),
            connected: true,
            configurationAccepted: true,
            hardwareAvailable: true,
            ready: policyConfirmed,
          }),
        } as unknown as WagoCommissioningReadiness,
      );
      let installed = '0'.repeat(64);
      const oldImage = `sha256:${'0'.repeat(64)}`;
      jest.mocked(managedSsh).mockImplementation(async (_access, key, header, _signal, payload) => {
        expect(key).toBe(credentials.privateKey);
        if (header.startsWith('inspect ')) return `${MANAGED_HELPER_PROTOCOL}\n${installed}\n${oldImage} true\n`;
        if (header.startsWith('installer-publish ')) {
          const source = (payload as Buffer).toString();
          expect(source).toBe(managedHostHelper(scope.artifact));
          installed = createHash('sha256').update(source).digest('hex');
          expect(header).toBe(
            `installer-publish ${credentials.token} ${installed} ${Buffer.byteLength(source)} ${signInstaller(credentials.installerPrivateKey, credentials.token, source)}`,
          );
        }
        if (header.startsWith('activate ')) {
          policyConfirmed = false;
          await new Promise((resolve) => setTimeout(resolve, 5));
          boot = '00000000-0000-4000-8000-000000000002';
          heartbeat(1, {
            imageId: scope.artifact.imageId,
            streamId: boot,
            sequence: ++sequence,
            timestamp: Date.now(),
            receivedAt: Date.now(),
          });
        }
        return 'OK\n';
      });
      scope.rootProbe.mockClear();
      restarted.onApplicationBootstrap();
      if (priorHeartbeat === 'fresh') {
        heartbeat(1, { imageId: oldImage, streamId: boot, sequence, timestamp: Date.now(), receivedAt: Date.now() });
      } else if (priorHeartbeat === 'stale') {
        restarted['heartbeats'].set(1, {
          imageId: oldImage,
          streamId: boot,
          timestamp: Date.now() - 120_000,
          receivedAt: Date.now() - 120_000,
        });
      }
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          const status = await restarted.status(1);
          if (status.update?.phase === 'current' && status.update.token === null) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(await restarted.status(1)).toMatchObject({
          management: 'managed',
          runtime: {
            runningVersion: current.runtimeVersion,
            runningImageId: scope.artifact.imageId,
            desiredVersion: scope.artifact.manifest.runtimeVersion,
            desiredImageId: scope.artifact.imageId,
          },
          update: {
            phase: 'current',
            token: null,
            desiredImageId: scope.artifact.imageId,
            previousRuntimeVersion: current.runtimeVersion,
            desiredRuntimeVersion: scope.artifact.manifest.runtimeVersion,
          },
        });
        expect(scope.rootProbe).not.toHaveBeenCalled();
        expect(jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0])).toEqual(
          expect.arrayContaining(['installer-publish', 'stage', 'activate', 'accept', 'acknowledge']),
        );
        expect(
          (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1'))[0]
            .encrypted_credentials,
        ).toBe(envelope);
      } finally {
        await restarted.onModuleDestroy();
        await new Promise(setImmediate);
      }
    },
  );
}
