import { WagoManagedAccess } from './runtime/managed/access.entity';
import { WagoController } from './controllers/entity';
import { WagoCommissioningSession } from './commissioning/session.entity';
import { ManagedRuntimeFixture } from './runtime/managed/setup.test-fixture';
export async function initializeCutover(scope: ManagedRuntimeFixture, remoteStatus: string) {
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
  return current;
}
