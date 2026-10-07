import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionFinishScript
} from './wago-hardware-deployment';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { WagoCommissioningServicePlatformOperation } from "./wago-commissioning.service.wago-commissioning-service-platform-operation";
export abstract class WagoCommissioningServiceCleanupControllerPreparationOperation extends WagoCommissioningServicePlatformOperation {


  protected async cleanupControllerPreparation(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    if (!session.dockerProvisionToken) return;
    if (session.dockerProvisionState !== 'restored') {
      session.dockerProvisionState = 'recovering';
      await this.save(session, 'controller_preparation_cleanup_started');
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        wagoDockerProvisionRecoveryScript(session.dockerProvisionToken),
        { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
      );
      session.dockerProvisionState = 'restored';
      await this.save(session, 'controller_preparation_cleanup_verified');
    }
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      wagoDockerProvisionFinishScript(session.dockerProvisionToken, 'restored'),
      { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
    );
    session.dockerProvisionToken = null;
    session.dockerProvisionState = null;
    await this.save(session, 'controller_preparation_cleaned_up');
  }
}
