import { WagoController } from './wago-controller.entity';
import { WagoServicePrepareClaimOperation } from './wago.service.wago-service-prepare-claim-operation';


export abstract class WagoServiceRestoreUnclaimedControllerOperation extends WagoServicePrepareClaimOperation {
  protected async restoreUnclaimedController(
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
    await this.withClaimConfigurationLock(() =>
      this.restoreUnclaimedControllerWhileLocked(
        {
          controller,
          mqttServerId,
          identity,
          previousController,
        },
        assertOwned,
      ),
    );
  }
}
