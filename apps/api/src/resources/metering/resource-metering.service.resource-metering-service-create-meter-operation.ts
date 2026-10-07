import { ResourceMeteringServiceListMetersOperation } from './resource-metering.service.resource-metering-service-list-meters-operation';
export abstract class ResourceMeteringServiceCreateMeterOperation extends ResourceMeteringServiceListMetersOperation {
  createMeter(resourceId: number, name: string) {
    return this.catalog.createMeter(resourceId, name);
  }
}
