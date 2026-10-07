import { ResourceMeteringServiceCreateMeterOperation } from './resource-metering.service.resource-metering-service-create-meter-operation';
export abstract class ResourceMeteringServiceUpdateMeterOperation extends ResourceMeteringServiceCreateMeterOperation {
  updateMeter(resourceId: number, meterId: number, name: string) {
    return this.catalog.updateMeter(resourceId, meterId, name);
  }
}
