import { randomBytes } from 'node:crypto';
import { RuntimeUpdateRecord } from './wago-runtime-update-contracts';
import { RuntimeUpdateError } from './wago-runtime-update.errors';
import { OPERATION_MS } from './wago-runtime-update.operation-ms';
import { WagoRuntimeUpdateCoordinatorRetryAtOperation } from './wago-runtime-update.wago-runtime-update-coordinator-retry-at-operation';

export abstract class RuntimeUpdateLease extends WagoRuntimeUpdateCoordinatorRetryAtOperation {
  protected createLease(controllerId: number) {
    const owner = randomBytes(16).toString('hex');
    const operation = new AbortController();
    this.operations.add(operation);
    const deadline = this.now() + OPERATION_MS;
    const timer = setTimeout(() => operation.abort(), OPERATION_MS).unref();
    const assertOwned = () => {
      if (this.stopped || operation.signal.aborted || this.now() >= deadline)
        throw new RuntimeUpdateError('interrupted');
    };
    const persist = async (record: RuntimeUpdateRecord) => {
      assertOwned();
      record.updatedAt = this.now();
      await this.store.save(record, owner, this.now());
      // Persist intent before audit and before any remote mutation. An audit failure
      // leaves recoverable intent; raw errors never enter public diagnostics.
      await this.audit(Object.freeze({ ...record }));
      assertOwned();
    };
    const acknowledge = async (record: RuntimeUpdateRecord): Promise<boolean> => {
      if (!record.token) return true;
      if ((record.cleanupRetryAt ?? 0) > this.now()) return false;
      try {
        await this.host.acknowledge(controllerId, record.token, operation.signal);
        assertOwned();
      } catch {
        assertOwned();
        record.cleanupAttempt = (record.cleanupAttempt ?? 0) + 1;
        record.cleanupRetryAt = this.retryAt(record.cleanupAttempt);
        await persist(record);
        return false;
      }
      record.token = null;
      record.cleanupAttempt = 0;
      record.cleanupRetryAt = 0;
      await persist(record);
      return true;
    };

    return { owner, operation, timer, assertOwned, persist, acknowledge };
  }
}
