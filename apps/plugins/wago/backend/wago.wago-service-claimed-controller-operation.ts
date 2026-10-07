import { WagoController } from './wago-controller.entity';
import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { WagoServiceWithClaimConfigurationLockOperation } from './wago.wago-service-with-claim-configuration-lock-operation';


export abstract class WagoServiceClaimedControllerOperation extends WagoServiceWithClaimConfigurationLockOperation {
  protected async claimedController(id: number): Promise<WagoController> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller || controller.trustState !== 'claimed')
      throw new NotFoundException(`claimed WAGO controller ${id} not found`);
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${id} has no MQTT server`);
    return controller;
  }
}
