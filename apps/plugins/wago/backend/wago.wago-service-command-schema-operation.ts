import { WagoServiceOnModuleDestroyOperation } from './wago.wago-service-on-module-destroy-operation';


export abstract class WagoServiceCommandSchemaOperation extends WagoServiceOnModuleDestroyOperation {
  async commandSchema(
    config: Record<string, unknown>,
    resourceId: number,
    previewOnly = false,
  ): Promise<Record<string, unknown>> {
    return this.commands.schema(config, resourceId, previewOnly);
  }
}
