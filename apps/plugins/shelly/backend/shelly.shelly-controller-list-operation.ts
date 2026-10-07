import { ShellyDevice } from './shelly-device.entity';
import { Get } from '@nestjs/common';
import { ShellyControllerDiscoverOperation } from './shelly.shelly-controller-discover-operation';

export abstract class ShellyControllerListOperation extends ShellyControllerDiscoverOperation {
  @Get('devices')
  list(): Promise<ShellyDevice[]> {
    return this.registry.list();
  }
}
