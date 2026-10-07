import { ResourceMeteringServiceSetRateOperation } from './resource-metering.service.resource-metering-service-set-rate-operation';
export abstract class ResourceMeteringServiceGetLiveOperation extends ResourceMeteringServiceSetRateOperation {
  getLive(resourceId: number) {
    return this.catalog.getLive(resourceId);
  }
}
