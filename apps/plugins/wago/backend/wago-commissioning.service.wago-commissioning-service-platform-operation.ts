import { commissionClock } from './wago-commissioning-clock';
import type { WagoCommissioningPreflightReport } from '../shared/commissioning';
import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { auditCommissioning, CommissioningPrincipal } from './wago-commissioning-audit';
import { WagoRecoveryError } from './wago-recovery-error';
import {
  wagoHardwareDeploymentReportScript,
  parseWagoHardwareDeploymentReport
} from './wago-hardware-deployment';
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { requireDeliveryCredentials } from "./wago-commissioning.service.require-delivery-credentials";
import { WagoCommissioningServiceReconcileDiscoveryOperation } from "./wago-commissioning.service.wago-commissioning-service-reconcile-discovery-operation";
import { WagoStorageCapacityError } from "./wago-commissioning.service.errors";
import { WagoControllerLockError } from "./wago-commissioning.service.errors";

export abstract class WagoCommissioningServicePlatformOperation extends WagoCommissioningServiceReconcileDiscoveryOperation {


  async platform(
    id: number,
    action: 'inspect' | 'activate' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      reviewedDockerActivation?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    const credential = requireDeliveryCredentials({ temporarySsh: input.temporarySsh, confirmInstall: true });
    if (action !== 'inspect' && input.reviewedDockerActivation !== true)
      throw new ConflictException('Explicit Docker activation or recovery approval is required.');
    return auditCommissioning(
      this.context,
      principal,
      id,
      `platform_${action}`,
      () =>
        this.withControllerLock(id, () =>
          this.withDeliveryLock(id, async () => {
            const session = await this.sessions.findOneBy({ id });
            if (!session) throw new NotFoundException('commissioning session not found');
            if (
              ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
              (session.state === 'revoked' && action !== 'recover')
            )
              throw new ConflictException('Finish identity confirmation and any active delivery first.');
            try {
              if (action === 'inspect') {
                session.platformReport = null;
                const report: WagoCommissioningPreflightReport = parseWagoHardwareDeploymentReport(
                  await this.sudoRunScript(
                    session.targetHost,
                    session.hostKeyFingerprint,
                    credential,
                    wagoHardwareDeploymentReportScript(),
                  ),
                );
                report.clock = await commissionClock(
                  (script, limits) =>
                    this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, limits),
                  false,
                  async () => undefined,
                );
                session.platformReport = JSON.stringify(report);
              } else if (action === 'activate') {
                const bundle = await this.acquireRuntimeBundle(session);
                try {
                  await this.prepareController(session, credential, bundle.bytes, bundle.hardwareProfile);
                } finally {
                  await rm(bundle.directory, { recursive: true, force: true });
                }
              } else {
                if (!session.dockerProvisionToken)
                  throw new ConflictException('No Docker provisioning attempt to recover.');
                await this.cleanupControllerPreparation(session, credential);
              }
              session.failureReason = null;
              return this.toResponse(await this.save(session, `platform_${action}_succeeded`));
            } catch (error) {
              if (error instanceof ConflictException) throw error;
              if (action !== 'inspect' && session.dockerProvisionToken)
                session.dockerProvisionState = 'recovery_required';
              session.failureReason =
                error instanceof WagoStorageCapacityError
                  ? error.message
                  : error instanceof WagoControllerLockError
                    ? error.message
                    : error instanceof WagoRecoveryError
                      ? error.message
                      : action === 'inspect'
                        ? 'Controller preflight could not be read. Check the explicit SSH credential and supported firmware tools.'
                        : action === 'activate'
                          ? 'Controller preparation failed. Check the runtime release, staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.'
                          : 'Controller preparation cleanup remains unverified. Clean up any runtime transaction first, then retry preparation cleanup. The recovery token is retained; previous workloads are not restored.';
              return this.toResponse(await this.save(session, `platform_${action}_failed`));
            }
          }),
        ),
      (result) => !result.failureReason,
    );
  }
}
