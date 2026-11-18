import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { controllerRow, revisionRow } from '../../rows.test-utils';
import { createWagoTestStorage } from '../../storage/testing';
import type { WagoCommissioningSession } from './session.entity';
import { commissioningVerification } from './verification';

describe('commissioning verification', () => {
  const now = new Date().toISOString();
  const session = {
    hardwareId: 'fixture',
    mqttServerId: 1,
    enrollmentId: 2,
    createdAt: now,
  } as WagoCommissioningSession;
  const controller = {
    id: 1,
    hardwareId: 'fixture',
    mqttServerId: 1,
    trustState: 'claimed',
    enrollmentId: 2,
    lastHeartbeatAt: now,
    compatibilityError: null,
  };
  const enrollment = { id: 2, revokedAt: now, hardwareId: 'fixture', mqttServerId: 1 };
  const revision = { state: 'applied', reportedAt: now };

  async function context(currentController = controller, currentEnrollment = enrollment, currentRevision = revision) {
    const storage = createWagoTestStorage();
    await storage.tables.controllers.insert(controllerRow(currentController));
    await storage.tables.enrollments.insert({
      secretHash: 'secret',
      identity: 'identity',
      createdAt: now,
      expiresAt: now,
      ...currentEnrollment,
    });
    await storage.tables.configurationRevisions.insert(
      revisionRow({ controllerId: currentController.id, revision: 1, ...currentRevision }),
    );
    return { storage: storage.storage, persistence: storage.persistence } as unknown as PluginContext;
  }

  it('does not claim hardware or hardening success from MQTT evidence alone', async () => {
    expect(await commissioningVerification(await context(), session)).toEqual({
      controllerId: 1,
      permanentConnection: true,
      enrollmentRevoked: true,
      configurationApplied: true,
      managementHardening: 'unverified',
      hardwareReadiness: 'unverified',
      physicalQualification: 'required',
      ready: false,
    });
  });

  it('rejects stale heartbeat, old enrollment and rejected configuration evidence', async () => {
    const result = await commissioningVerification(
      await context(
        { ...controller, lastHeartbeatAt: '2020-01-01T00:00:00.000Z' },
        { ...enrollment, hardwareId: 'another-controller' },
        { ...revision, state: 'rejected' },
      ),
      session,
    );
    expect(result.permanentConnection).toBe(false);
    expect(result.enrollmentRevoked).toBe(false);
    expect(result.configurationApplied).toBe(false);
  });

  it('requires a heartbeat from the current enrollment', async () => {
    const result = await commissioningVerification(await context({ ...controller, enrollmentId: 99 }), session);
    expect(result.permanentConnection).toBe(false);
  });
});
