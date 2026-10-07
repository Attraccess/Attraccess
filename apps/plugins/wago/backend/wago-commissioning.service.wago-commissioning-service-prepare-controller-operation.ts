import { CC100_DIGITAL_PROFILE_ID, type Cc100HardwareProfile } from '../shared/hardware-profile';
import {
  ConflictException
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  wagoCommissioningPreparationScript,
} from './wago-hardware-deployment';
import {
  runtimeBundleStagingCapacityPreflightScript
} from './wago-runtime-install';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { WagoCommissioningServiceCleanupControllerPreparationOperation } from "./wago-commissioning.service.wago-commissioning-service-cleanup-controller-preparation-operation";
import { WagoControllerLockError } from "./wago-commissioning.service.errors";

export abstract class WagoCommissioningServicePrepareControllerOperation extends WagoCommissioningServiceCleanupControllerPreparationOperation {


  /** Persist ownership before destructive host changes so interruption is recoverable. */
  protected async prepareController(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    verifiedBundleBytes: number,
    hardwareProfile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
  ): Promise<void> {
    if (session.deliveryToken)
      throw new ConflictException('Clean up the retained runtime installation before preparing the controller.');
    if (session.dockerProvisionToken && session.dockerProvisionState !== 'started')
      throw new ConflictException('Clean up the retained controller preparation before retrying.');
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleStagingCapacityPreflightScript(verifiedBundleBytes),
      { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 65_536, storageDiagnostic: true },
    );
    session.dockerProvisionToken ??= randomBytes(16).toString('hex');
    session.dockerProvisionState = 'starting';
    await this.save(session, 'controller_preparation_started');
    try {
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        wagoCommissioningPreparationScript(session.dockerProvisionToken, '', hardwareProfile),
        {
          timeoutMs: SSH_TIMEOUT_MS,
          maxOutputBytes: 65_536,
          lockDiagnostic: true,
          onProgress: (checkpoint) => this.reportPreparationProgress(session, checkpoint),
        },
      );
      await this.transferWrites.get(session.id);
      session.dockerProvisionState = 'started';
      session.codesysState = 'disabled';
      await this.save(session, 'controller_prepared');
    } catch (error) {
      await this.transferWrites.get(session.id);
      if (error instanceof WagoControllerLockError) {
        session.dockerProvisionToken = null;
        session.dockerProvisionState = null;
        await this.save(session, 'controller_preparation_busy');
        throw error;
      }
      session.dockerProvisionState = 'recovery_required';
      await this.save(session, 'controller_preparation_failed');
      throw error;
    }
  }
}
