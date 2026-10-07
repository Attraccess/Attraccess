import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { WagoServiceDeleteEnrollmentByIdOperation } from './wago.wago-service-delete-enrollment-by-id-operation';


export abstract class WagoServiceRemoveOperation extends WagoServiceDeleteEnrollmentByIdOperation {
  /** Revokes the controller's access before removing all of its local state. */
  async remove(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<string> {
    return this.withClaimLock(id, () =>
      this.withClaimConfigurationLock(async () => {
        const controller = await this.controllers.findOneBy({ id });
        if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);

        const credentialServerId =
          controller.credentialMqttServerId ?? (controller.trustState === 'claimed' ? controller.mqttServerId : null);
        if (credentialServerId) {
          const identity = `wago-controller-${controller.hardwareId}`;
          await assertOwned();
          const manual = await this.context.getMqttCredentialProvisioning().revoke({
            mqttServerId: credentialServerId,
            identity,
            username: identity,
            vhost: '/',
          });
          if (manual)
            throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
        }

        if (controller.enrollmentId) await this.revokeEnrollmentById(controller.enrollmentId, assertOwned);
        await assertOwned();
        await Promise.all([this.drafts.delete({ controllerId: id }), this.revisions.delete({ controllerId: id })]);
        await assertOwned();
        await this.controllers.delete(id);
        this.configurationReportQueues.delete(id);
        await this.subscribeConfiguredServers().catch((error) => {
          this.context.logger.warn(
            `Could not refresh WAGO MQTT subscriptions after controller removal: ${String(error)}`,
          );
          this.scheduleSubscriptionRetry();
        });
        return controller.hardwareId;
      }),
    );
  }
}
