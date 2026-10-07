import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { managedSsh } from './wago-managed-ssh';
import { commissioningVerification } from './wago-commissioning-verification';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it.each(['connection', 'runtime_state', 'enrollment_credentials', 'configuration', 'readiness'] as const)(
    'explains the %s prerequisite holding up automatic SSH completion without touching SSH',
    async (reason) => {
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
      await scope.db.getRepository(WagoCommissioningSession).save(
        Object.assign(scope.session(), {
          mqttServerId: 7,
          firmwareBaseline: '31',
          state: 'awaiting_verification',
          initiatingPrincipal: JSON.stringify(scope.principal),
          auditLog: '[]',
          createdAt: now,
          updatedAt: now,
        }),
      );
      await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
      await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'verified' });
      if (reason !== 'connection')
        scope.service['heartbeats'].set(1, {
          imageId: scope.artifact.imageId,
          streamId: 'boot-new',
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      scope.service['readiness'].observe = jest.fn(() =>
        reason === 'runtime_state'
          ? undefined
          : {
              timestamp: Date.now(),
              streamId: 'boot-new',
              sequence: 1,
              revision: 1,
              contentHash: 'a'.repeat(64),
              connected: true,
              configurationAccepted: reason !== 'configuration',
              hardwareAvailable: reason !== 'readiness',
              ready: reason !== 'configuration' && reason !== 'readiness',
            },
      );
      jest.mocked(commissioningVerification).mockResolvedValue({
        controllerId: 1,
        permanentConnection: true,
        enrollmentRevoked: reason !== 'enrollment_credentials',
        configurationApplied: reason !== 'configuration',
        hardwareReadiness: reason === 'readiness' ? 'not_ready' : 'ready',
        managementHardening: 'unverified',
        physicalQualification: 'required',
        ready: false,
      });
      jest.mocked(managedSsh).mockClear();
      expect(await scope.service['completeEnrolment'](current)).toBe(false);
      expect(await scope.service.status(1)).toMatchObject({
        management: 'verified',
        managementSetup: { state: 'waiting', reason },
      });
      expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    },
  );
}
