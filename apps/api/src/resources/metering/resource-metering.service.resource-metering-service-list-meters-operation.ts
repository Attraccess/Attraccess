import { ResourceMeteringServiceWaiveOperation } from './resource-metering.service.resource-metering-service-waive-operation';
export abstract class ResourceMeteringServiceListMetersOperation extends ResourceMeteringServiceWaiveOperation {
  listMeters(resourceId: number) {
    return this.catalog.listMeters(resourceId);
  }
}
