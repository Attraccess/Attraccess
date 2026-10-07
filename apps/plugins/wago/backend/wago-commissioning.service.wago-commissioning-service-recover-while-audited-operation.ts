import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoRecoveryError } from './wago-recovery-error';
import {
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleRecoveryScript
} from './wago-runtime-install';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { DeliveryInput } from "./wago-commissioning.service.delivery-input";
import { requireDeliveryCredentials } from "./wago-commissioning.service.require-delivery-credentials";
import { WagoCommissioningServiceRecoverOperation } from "./wago-commissioning.service.wago-commissioning-service-recover-operation";
export abstract class WagoCommissioningServiceRecoverWhileAuditedOperation extends WagoCommissioningServiceRecoverOperation {


  protected async recoverWhileAudited(id: number, input: DeliveryInput): Promise<CommissioningSessionResponse> {
    const suppliedCredential = requireDeliveryCredentials(input);
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ![
            'delivery_failed',
            'awaiting_discovery',
            'awaiting_verification',
            'claim_interrupted',
            'recovery_revocation_pending',
            'revoked',
            'delivering',
            'awaiting_codesys_confirmation',
          ].includes(session.state)
        )
          throw new ConflictException('commissioning session cannot be recovered in its current state');
        const requiresNewSession =
          !session.pairingCode || ['claim_interrupted', 'awaiting_verification'].includes(session.state);
        if (!session.deliveryToken)
          throw new ConflictException('commissioning session has no runtime recovery ownership token');
        let restored = session.state === 'recovery_revocation_pending';
        try {
          const recoveryPassword = await this.managedRuntime?.commissioningRecoveryPassword?.(session);
          const credential = recoveryPassword ? { username: 'root', password: recoveryPassword } : suppliedCredential;
          // Cleanup must remain available even when the broker is unavailable.
          // Destructive commissioning never promises restoration of old workloads.
          if (!restored)
            await this.sudoRunScript(
              session.targetHost,
              session.hostKeyFingerprint,
              credential,
              runtimeBundleRecoveryScript('', session.deliveryToken),
              { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
            );
          restored = true;
          if (requiresNewSession) session.pairingCode = null;
          session.state = 'recovery_revocation_pending';
          session.progressStep = 'Runtime installation cleaned up';
          session.progressDetail =
            'Failed runtime installation cleaned up. CODESYS remains disabled; previous workloads are not restored.';
          if (!session.pairingCode)
            session.progressDetail +=
              ' Remove the existing controller registration before creating a new commissioning session.';
          session.failureReason = null;
          await this.save(session, 'runtime_restored_revocation_pending');
          await this.sudoRunScript(
            session.targetHost,
            session.hostKeyFingerprint,
            credential,
            runtimeBundleRecoveryAcknowledgementScript('', session.deliveryToken),
            { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
          );
          await this.cleanupControllerPreparation(session, credential);
          await this.revokeSessionEnrollment(session);
          session.state = session.pairingCode ? 'delivery_failed' : 'revoked';
          session.deliveryToken = null;
          return this.toResponse(await this.save(session, 'runtime_recovered'));
        } catch (error) {
          session.state = restored
            ? 'recovery_revocation_pending'
            : requiresNewSession
              ? 'claim_interrupted'
              : 'delivery_failed';
          session.progressStep = 'Recovery requires attention';
          session.progressDetail = restored
            ? 'Runtime cleanup completed. Retry recovery to finish preparation cleanup and broker credential revocation.'
            : 'Recovery could not be confirmed. An active lock is never removed; retry explicit recovery after the active operation ends.';
          session.failureReason =
            error instanceof WagoRecoveryError
              ? `${error.message}${restored ? ' Runtime cleanup completed; retry cleanup to finish controller preparation and credential revocation.' : ''}`
              : 'Installation cleanup or credential revocation failed; finish the retained recovery before retrying delivery.';
          return this.toResponse(await this.save(session, 'runtime_recovery_failed'));
        }
      }),
    );
  }
}
