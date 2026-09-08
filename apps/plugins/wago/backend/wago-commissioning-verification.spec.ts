import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { commissioningVerification } from './wago-commissioning-verification';

describe('commissioning verification', () => {
  const now = new Date().toISOString();
  const session = {
    hardwareId: 'fixture',
    mqttServerId: 1,
    enrollmentId: 2,
    createdAt: now,
  } as WagoCommissioningSession;
  const controller = { id: 1, trustState: 'claimed', enrollmentId: 2, lastHeartbeatAt: now, compatibilityError: null };
  const enrollment = { revokedAt: now, hardwareId: 'fixture', mqttServerId: 1 };
  const revision = { state: 'applied', reportedAt: now };

  function context(currentController = controller, currentEnrollment = enrollment, currentRevision = revision) {
    return {
      getRepository: (entity: unknown) =>
        entity === WagoController
          ? { findOneBy: async () => currentController }
          : entity === WagoEnrollment
            ? { findOneBy: async () => currentEnrollment }
            : { findOne: async () => currentRevision },
    } as unknown as PluginContext;
  }

  it('does not claim hardware or hardening success from MQTT evidence alone', async () => {
    expect(await commissioningVerification(context(), session)).toEqual({
      permanentConnection: true,
      enrollmentRevoked: true,
      configurationApplied: true,
      managementHardening: 'unverified',
      hardwareReadiness: 'unverified',
      ready: false,
    });
  });

  it('rejects stale heartbeat, old enrollment and rejected configuration evidence', async () => {
    const result = await commissioningVerification(
      context(
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
    const result = await commissioningVerification(context({ ...controller, enrollmentId: 99 }), session);
    expect(result.permanentConnection).toBe(false);
  });
});
