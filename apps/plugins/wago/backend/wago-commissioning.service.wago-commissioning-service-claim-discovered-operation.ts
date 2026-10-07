import { auditCommissioning, commissioningPrincipal, CommissioningPrincipal } from './wago-commissioning-audit';
import { WagoCommissioningServiceRemoveControllerSafelyOperation } from "./wago-commissioning.service.wago-commissioning-service-remove-controller-safely-operation";
export abstract class WagoCommissioningServiceClaimDiscoveredOperation extends WagoCommissioningServiceRemoveControllerSafelyOperation {


  async claimDiscovered(controller: {
    id: number;
    hardwareId: string;
    mqttServerId: number | null;
    enrollmentId: number | null;
  }): Promise<void> {
    if (!controller.mqttServerId || !controller.enrollmentId) return;
    const session = await this.sessions.findOneBy({
      hardwareId: controller.hardwareId,
      mqttServerId: controller.mqttServerId,
      enrollmentId: controller.enrollmentId,
    });
    if (!session) return;

    await this.withControllerLock(session.id, () =>
      this.withDeliveryLock(session.id, async () => {
        const current = await this.sessions.findOneBy({ id: session.id });
        if (
          !current ||
          current.state !== 'awaiting_discovery' ||
          current.hardwareId !== controller.hardwareId ||
          current.mqttServerId !== controller.mqttServerId ||
          current.enrollmentId !== controller.enrollmentId ||
          !current.controllerName ||
          !current.pairingCode
        )
          return;

        let pairingCode: string;
        try {
          pairingCode = this.decryptVerifier(current);
        } catch {
          await this.invalidateVerifier(current);
          return;
        }
        current.state = 'awaiting_claim';
        current.failureReason = null;
        current.progressPercent = 100;
        current.progressStep = 'Claiming controller';
        current.progressDetail = 'Applying permanent credentials and the reserved controller name.';
        await this.save(current, 'automatic_claim_started');
        try {
          let principal: CommissioningPrincipal | null = null;
          try {
            const saved = JSON.parse(current.initiatingPrincipal ?? 'null');
            if (saved)
              principal = commissioningPrincipal({
                user: {
                  id: saved.userId,
                  authenticationMethod: saved.authenticationMethod,
                  apiTokenId: saved.apiTokenId,
                },
              } as never);
          } catch {
            /* Legacy sessions never invent an initiating actor. */
          }
          await this.operationContext.getStore()?.assertOwned();
          await this.managedRuntime?.bind(current.id, controller.id);
          await auditCommissioning(this.context, principal, controller.id, 'claim', () =>
            this.wago.claim(
              controller.id,
              current.controllerName,
              pairingCode,
              current.mqttServerId,
              this.operationContext.getStore()?.assertOwned,
            ),
          );
          current.state = 'awaiting_verification';
          current.pairingCode = null;
          current.failureReason = null;
          current.progressStep = 'Verifying commissioned controller';
          current.progressDetail =
            'Claim sent. Permanent connection, credential revocation, configuration and management hardening still require verification.';
          await this.save(current, 'automatic_claim_completed');
        } catch {
          current.state = 'awaiting_discovery';
          current.failureReason = 'Automatic claim failed.';
          await this.save(current, 'automatic_claim_failed');
          return;
        }
        await this.retireSupersededSessions(current.hardwareId, current.id).catch(() =>
          this.context.logger?.warn('Could not retire superseded WAGO commissioning sessions.'),
        );
      }),
    );
  }
}
