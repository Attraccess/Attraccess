import { WagoFlowServiceResolveConfigSchemaOperation } from './wago-flow.service.wago-flow-service-resolve-config-schema-operation';


export abstract class WagoFlowServiceCachedOperation extends WagoFlowServiceResolveConfigSchemaOperation {
  protected cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
    if (!context.has(key)) context.set(key, load());
    return context.get(key) as Promise<T>;
  }
}
