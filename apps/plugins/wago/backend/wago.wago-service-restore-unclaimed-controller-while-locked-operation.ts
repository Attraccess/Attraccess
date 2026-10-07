import { WagoController } from './wago-controller.entity';
import { ConflictException } from '@nestjs/common';
import { WagoServiceRestoreUnclaimedControllerOperation } from './wago.wago-service-restore-unclaimed-controller-operation';


export abstract class WagoServiceRestoreUnclaimedControllerWhileLockedOperation extends WagoServiceRestoreUnclaimedControllerOperation {
  protected async restoreUnclaimedControllerWhileLocked(
    {
      controller,
      mqttServerId,
      identity,
      previousController,
    }: {
      controller: WagoController;
      mqttServerId: number;
      identity: string;
      previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    },
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    await assertOwned();
    const manual = await this.context
      .getMqttCredentialProvisioning()
      .revoke({ mqttServerId, identity, username: identity, vhost: '/' });
    if (manual) throw new ConflictException('Manual permanent credential revocation is required.');
    await assertOwned();
    controller.credentialMqttServerId = null;
    controller.credentialEpoch = null;
    Object.assign(controller, previousController);
    await assertOwned();
    await this.controllers.save(controller).catch((rollbackError) => {
      this.context.logger.warn(
        `Could not restore WAGO controller ${controller.id} after claim failure: ${String(rollbackError)}`,
      );
    });
  }
}
