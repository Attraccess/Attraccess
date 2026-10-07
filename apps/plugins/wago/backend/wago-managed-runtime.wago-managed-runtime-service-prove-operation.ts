import { WagoManagedAccess } from './wago-managed-access.entity';
import { randomBytes } from 'node:crypto';
import { WagoManagedRuntimeServiceConnectionOperation } from './wago-managed-runtime.wago-managed-runtime-service-connection-operation';


export abstract class WagoManagedRuntimeServiceProveOperation extends WagoManagedRuntimeServiceConnectionOperation {
  protected async prove(access: WagoManagedAccess, signal?: AbortSignal) {
    const nonce = randomBytes(16).toString('hex');
    if ((await this.connection(access, `proof ${nonce}`, signal)) !== `OK ${nonce}\n`)
      throw new Error('Managed key proof failed');
  }
}
