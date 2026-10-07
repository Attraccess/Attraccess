import { ResourceMeteringServiceOnModuleInitOperation } from './resource-metering.service.resource-metering-service-on-module-init-operation';
export abstract class ResourceMeteringServiceGetDefinitionOperation extends ResourceMeteringServiceOnModuleInitOperation {
  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  getDefinition(resourceId: number, meterId: number) {
    return this.catalog.getDefinition(resourceId, meterId);
  }
}
