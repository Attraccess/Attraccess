import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { CommissioningRuntimeState } from './wago-commissioning-readiness';

export async function commissioningVerification(
  context: PluginContext,
  session: WagoCommissioningSession,
  runtime?: CommissioningRuntimeState,
) {
  const controller = await context.getRepository(WagoController).findOneBy({
    hardwareId: session.hardwareId,
    mqttServerId: session.mqttServerId,
  });
  const enrollment =
    session.enrollmentId === null
      ? null
      : await context.getRepository(WagoEnrollment).findOneBy({ id: session.enrollmentId });
  const revision = controller
    ? await context.getRepository(WagoConfigurationRevision).findOne({
        where: { controllerId: controller.id },
        order: { revision: 'DESC' },
      })
    : null;
  const heartbeat = controller?.lastHeartbeatAt ? Date.parse(controller.lastHeartbeatAt) : NaN;
  const permanentConnection = Boolean(
    controller?.trustState === 'claimed' &&
    controller.enrollmentId === session.enrollmentId &&
    heartbeat >= Date.parse(session.createdAt) &&
    heartbeat <= Date.now() &&
    Date.now() - heartbeat < 90_000 &&
    !controller.compatibilityError,
  );
  const runtimeFresh = Boolean(
    runtime &&
    runtime.timestamp >= Date.parse(session.createdAt) &&
    Date.now() - runtime.timestamp < 90_000 &&
    runtime.timestamp <= Date.now(),
  );
  const hardwareReadiness = !runtime
    ? 'unverified'
    : !runtimeFresh
      ? 'stale'
      : runtime.connected &&
          runtime.ready &&
          runtime.hardwareAvailable &&
          runtime.configurationAccepted &&
          revision?.state === 'applied' &&
          runtime.revision === revision.revision &&
          runtime.contentHash === revision.contentHash
        ? 'ready'
        : 'not_ready';
  return {
    controllerId:
      controller?.trustState === 'claimed' && controller.enrollmentId === session.enrollmentId ? controller.id : null,
    permanentConnection,
    enrollmentRevoked: Boolean(
      enrollment?.revokedAt &&
      enrollment.hardwareId === session.hardwareId &&
      enrollment.mqttServerId === session.mqttServerId,
    ),
    configurationApplied: Boolean(
      revision?.state === 'applied' &&
      revision.reportedAt &&
      Date.parse(revision.reportedAt) >= Date.parse(session.createdAt),
    ),
    // No qualified firmware-31 management transition or hardware health evidence exists yet.
    // Never turn a successful claim publication into a hardened-device success signal.
    managementHardening: 'unverified' as const,
    hardwareReadiness,
    physicalQualification: 'required' as const,
    ready: false as const,
  };
}
