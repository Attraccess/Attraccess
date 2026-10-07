import { WagoAudit } from './wago-audit';
import { BadRequestException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoServiceRemoveOperation } from './wago.wago-service-remove-operation';
import { WagoCredentialOperationUncertainError } from './wago.wago-credential-operation-uncertain-error';


export abstract class WagoServiceCompleteManualCredentialsOperation extends WagoServiceRemoveOperation {
  async completeManualCredentials(
    id: number,
    input: { name: string; verifier: string; username: string; password: string },
    principal: PluginAuditPrincipal,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<{ controllerId: number; result: 'acknowledged' }> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    if (
      input.username !== `wago-controller-${controller.hardwareId}` ||
      !input.password ||
      input.password.length > 4096
    )
      throw new BadRequestException('Supply the controller identity and provisioned password');
    if (!(JSON.parse(controller.capabilities) as string[]).includes('claim-expiry-v1'))
      throw new ConflictException('Install a runtime supporting expiring claims before manual credential fallback');
    return new WagoAudit(this.context).run(principal, id, 'manual_credential_fallback', {}, async () => {
      let active = true;
      let dispatched = false;
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      const assertActive = async () => {
        if (!active) throw new ConflictException('Controller credential operation ended');
        await assertOwned();
        if (!active) throw new ConflictException('Controller credential operation ended');
      };
      let acknowledged!: () => void;
      const receipt = new Promise<void>((resolve) => {
        acknowledged = resolve;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiration = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          active = false;
          reject(
            dispatched
              ? new WagoCredentialOperationUncertainError('Controller credential acknowledgement timed out')
              : new ConflictException('Controller credential acknowledgement timed out'),
          );
        }, 30_000);
      });
      try {
        // A timed-out continuation keeps the claim lock until its await settles;
        // assertActive prevents any later persistence, publication or revocation.
        await Promise.race([
          (async () => {
            await this.claim(id, input.name, input.verifier, undefined, assertActive, {
              credentials: { username: input.username, password: input.password },
              acknowledged,
              expiresAt,
              dispatched: () => {
                dispatched = true;
              },
            });
            await receipt;
            await assertActive();
          })(),
          expiration,
        ]);
        return { controllerId: id, result: 'acknowledged' as const };
      } catch (error) {
        if (dispatched && !(error instanceof WagoCredentialOperationUncertainError))
          throw new WagoCredentialOperationUncertainError(
            'Controller credential handoff is uncertain; recover the controller operation before retrying',
          );
        throw error;
      } finally {
        active = false;
        clearTimeout(timer);
        if (controller.enrollmentId) this.clearClaimAcknowledgement(controller.enrollmentId);
      }
    });
  }
}
