import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { Credentials } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceCredentialsOperation } from './wago-managed-runtime.wago-managed-runtime-service-credentials-operation';


export abstract class WagoManagedRuntimeServiceConnectionOperation extends WagoManagedRuntimeServiceCredentialsOperation {
  protected async connection(
    access: WagoManagedAccess,
    header: string,
    signal?: AbortSignal,
    file?: string | Buffer,
    targetHost = access.host,
  ) {
    const operation = new AbortController();
    this.connections.add(operation);
    const abort = () => operation.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25 * 60_000).unref();
    try {
      if (this.destroyed || signal?.aborted) operation.abort();
      let credentials: Credentials;
      try {
        credentials = this.credentials(access);
      } catch {
        throw new RuntimeUpdateError('management_required');
      }
      return await managedSsh({ ...access, host: targetHost }, credentials.privateKey, header, operation.signal, file);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      operation.abort();
      this.connections.delete(operation);
    }
  }
}
