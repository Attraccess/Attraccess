import { WagoManagedAccess } from './access.entity';
import { WagoController } from '../../controllers/entity';
import { WagoCommissioningSession } from '../../commissioning/session.entity';
import { commissioningVerification } from '../../commissioning/verification';
import type { ManagedRuntimeFixture } from './setup.test-fixture';

export async function prepareRebootReconciliation(scope: ManagedRuntimeFixture, remoteStatus: string) {
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
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await scope.db.getRepository(WagoCommissioningSession).save(
    Object.assign(scope.session(), {
      mqttServerId: 7,
      firmwareBaseline: '31',
      state: 'awaiting_verification',
      initiatingPrincipal: JSON.stringify(scope.principal),
      deliveryToken: 'a'.repeat(32),
      dockerProvisionToken: 'a'.repeat(32),
      auditLog: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
  await scope.db.getRepository(WagoManagedAccess).update(1, {
    controllerId: 1,
    state: remoteStatus === 'new-server-runtime' ? 'verified' : 'recovery_required',
  });
  const now = Date.now();
  scope.service['heartbeats'].set(1, {
    imageId: scope.artifact.imageId,
    streamId: 'boot-new',
    timestamp: now,
    receivedAt: now,
  });
  scope.service['readiness'].observe = jest.fn(() => ({
    timestamp: now,
    streamId: 'boot-new',
    sequence: 1,
    revision: 1,
    contentHash: 'a'.repeat(64),
    connected: true,
    configurationAccepted: true,
    hardwareAvailable: true,
    ready: true,
  }));
  jest.mocked(commissioningVerification).mockResolvedValue({
    controllerId: 1,
    permanentConnection: true,
    enrollmentRevoked: true,
    configurationApplied: true,
    hardwareReadiness: 'ready',
    managementHardening: 'unverified',
    physicalQualification: 'required',
    ready: false,
  });
  return { current, now };
}
