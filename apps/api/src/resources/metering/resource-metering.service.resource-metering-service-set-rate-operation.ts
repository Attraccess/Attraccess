import { ResourceMeteringServiceUpdateMeterOperation } from './resource-metering.service.resource-metering-service-update-meter-operation';
export abstract class ResourceMeteringServiceSetRateOperation extends ResourceMeteringServiceUpdateMeterOperation {
  setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    return this.catalog.setRate(resourceId, meterId, creditsPerUnit);
  }
}
