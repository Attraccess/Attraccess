import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { commissioningVerification } from './wago-commissioning-verification';
import { ManagementSetupReason } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceScanOperation } from './wago-managed-runtime.wago-managed-runtime-service-scan-operation';


export abstract class WagoManagedRuntimeServiceEnrolmentWaitReasonOperation extends WagoManagedRuntimeServiceScanOperation {
  protected async enrolmentWaitReason(
    controller: WagoController,
    session: WagoCommissioningSession | null,
  ): Promise<ManagementSetupReason | null> {
    if (
      !controller.mqttServerId ||
      !session ||
      !['awaiting_verification', 'completed'].includes(session.state) ||
      session.hardwareId !== controller.hardwareId ||
      session.mqttServerId !== controller.mqttServerId
    )
      return 'session';
    if (!this.rootProbe) return 'server_setup';
    const proof = this.heartbeats.get(controller.id);
    if (!proof || Date.now() - proof.receivedAt > 90_000) return 'connection';
    const state = this.readiness.observe(
      controller.mqttServerId,
      controller.hardwareId,
      (await this.wago.getSettings()).operationalPrefix,
    );
    if (!state || state.streamId !== proof.streamId || Date.now() - state.timestamp > 90_000) return 'runtime_state';
    const verification = await commissioningVerification(this.context, session, state);
    if (!verification.permanentConnection) return 'connection';
    if (!verification.enrollmentRevoked) return 'enrollment_credentials';
    if (!verification.configurationApplied) return 'configuration';
    if (!state.ready || verification.hardwareReadiness !== 'ready') return 'readiness';
    return null;
  }
}
