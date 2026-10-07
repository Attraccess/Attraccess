import {
  ConflictException
} from '@nestjs/common';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningServiceInvalidateVerifierOperation } from "./wago-commissioning.service.wago-commissioning-service-invalidate-verifier-operation";
export abstract class WagoCommissioningServiceRecoverSessionsOperation extends WagoCommissioningServiceInvalidateVerifierOperation {


  protected async recoverSessions(): Promise<void> {
    let recoveryFailed = false;
    // Page the entire stable ID ordering: changing states must not skip rows.
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const candidate of page) {
        // An enrolled session needs no startup mutation. A background managed
        // check can legitimately hold its lease; do not disable discovery for it.
        if (
          ['completed', 'awaiting_verification', 'claim_interrupted'].includes(candidate.state) &&
          !candidate.pairingCode &&
          !(candidate.dockerProvisionToken && ['starting', 'recovering'].includes(candidate.dockerProvisionState ?? ''))
        )
          continue;
        try {
          await this.withControllerLock(candidate.id, async () => {
            const session = await this.sessions.findOneBy({ id: candidate.id });
            if (!session || session.state === 'recovery_revocation_pending') return;
            if (
              session.dockerProvisionToken &&
              ['starting', 'recovering'].includes(session.dockerProvisionState ?? '')
            ) {
              session.dockerProvisionState = 'recovery_required';
              session.failureReason =
                'Controller preparation was interrupted. Clean up the retained attempt before retrying.';
              await this.save(session, 'controller_preparation_interrupted');
            }
            if (
              ['completed', 'awaiting_verification', 'claim_interrupted'].includes(session.state) &&
              !session.pairingCode
            )
              return;
            if (session.state === 'revoked' && !session.pairingCode) {
              await this.revokeSessionEnrollment(session);
              return;
            }
            try {
              this.decryptVerifier(session);
            } catch {
              await this.invalidateVerifier(session);
              return;
            }
            if (session.state === 'awaiting_claim') {
              const controller =
                session.enrollmentId === null
                  ? null
                  : await this.context.getRepository(WagoController).findOneBy({
                      hardwareId: session.hardwareId,
                      mqttServerId: session.mqttServerId,
                      enrollmentId: session.enrollmentId,
                    });
              // A persisted claim may already have reached the device. Do not reinstall
              // or rotate its permanent identity merely because the API restarted.
              session.state = controller?.trustState === 'claimed' ? 'claim_interrupted' : 'awaiting_discovery';
              session.progressStep = 'Claim interrupted; recovery required';
              session.progressDetail =
                'Permanent credentials may or may not have reached the runtime. Do not retry installation; recover the saved runtime and remove its controller registration before creating a new session.';
              await this.save(session, 'claim_reconciled_after_restart');
            }
            if (session.state === 'delivering') {
              session.state = 'delivery_failed';
              session.progressStep = 'Delivery interrupted';
              session.progressDetail =
                'Clean up the retained preparation or runtime installation before retrying with explicit SSH credentials.';
              session.failureReason = 'Commissioning was interrupted.';
              await this.save(session, 'delivery_interrupted');
              await this.revokeSessionEnrollment(session);
            }
          });
        } catch {
          // Still invalidate later plaintext sessions when one broker is unavailable.
          recoveryFailed = true;
        }
      }
      if (page.length < 100) break;
    }
    if (recoveryFailed) throw new ConflictException('Commissioning recovery requires credential revocation.');
  }
}
