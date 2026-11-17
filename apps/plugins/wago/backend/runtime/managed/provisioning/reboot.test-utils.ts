import { commissioningVerification } from '../../../commissioning/sessions/verification';
import {
  seedAwaitingVerificationSession,
  seedClaimedController,
  type ManagedRuntimeFixture,
} from '../setup.test-fixture';

export async function prepareRebootReconciliation(scope: ManagedRuntimeFixture, remoteStatus: string) {
  const current = await seedClaimedController(scope.store);
  await seedAwaitingVerificationSession(scope);
  await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
  await scope.store.tables.managedAccess.update(
    { sessionId: 1 },
    {
      controllerId: 1,
      state: remoteStatus === 'new-server-runtime' ? 'verified' : 'recovery_required',
    },
  );
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
