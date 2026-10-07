import { WagoCommandHandlerRejectOperation } from './wago-command-handler.wago-command-handler-reject-operation';


export abstract class WagoCommandHandlerCachedOperation extends WagoCommandHandlerRejectOperation {
  protected cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
    const cached = context.get(key) as Promise<T> | undefined;
    if (cached) return cached;
    const value = load();
    context.set(key, value);
    return value;
  }
}
