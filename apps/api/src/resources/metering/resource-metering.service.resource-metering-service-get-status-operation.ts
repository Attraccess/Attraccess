import { ResourceMeteringServiceGetLiveOperation } from './resource-metering.service.resource-metering-service-get-live-operation';
export abstract class ResourceMeteringServiceGetStatusOperation extends ResourceMeteringServiceGetLiveOperation {
  getStatus(resourceId: number) {
    return this.catalog.getStatus(resourceId);
  }
}
