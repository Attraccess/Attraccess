import type { RuntimeUpdateRecord } from './wago-runtime-update';
import type { RuntimeUpdateStore } from './wago-runtime-update';
import { WagoManagedRuntimeServiceSecurityAuditOperation } from './wago-managed-runtime.wago-managed-runtime-service-security-audit-operation';


export abstract class WagoManagedRuntimeServiceUpdateStoreOperation extends WagoManagedRuntimeServiceSecurityAuditOperation {
  protected updateStore(): RuntimeUpdateStore {
    const owners = new Map<string, string>();
    return {
      acquire: async (controllerId, owner, now, until) => {
        const access = await this.required(controllerId);
        if (!(await this.operations.acquire(access.fingerprint, owner, now, until))) return false;
        try {
          await this.assertNetworkSettled(controllerId);
          await this.required(controllerId);
        } catch (error) {
          await this.operations.release(access.fingerprint, owner);
          throw error;
        }
        owners.set(owner, access.fingerprint);
        await this.updates.createQueryBuilder().insert().values({ controllerId }).orIgnore().execute();
        return true;
      },
      load: async (controllerId) => {
        const row = await this.updates.findOneBy({ controllerId });
        return row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null;
      },
      save: async (record, owner, now) => {
        const fingerprint = owners.get(owner);
        if (!fingerprint) throw new Error('Update lease lost');
        const result = await this.updates
          .createQueryBuilder()
          .update()
          .set({ metadata: JSON.stringify(record) })
          .where(
            'controller_id = :controllerId AND EXISTS (SELECT 1 FROM plugin_wago_device_operations WHERE fingerprint = :fingerprint AND owner = :owner AND lease_until > :now)',
            { controllerId: record.controllerId, fingerprint, owner, now },
          )
          .execute();
        if (result.affected !== 1) throw new Error('Update lease lost');
      },
      release: async (_id, owner) => {
        const fingerprint = owners.get(owner);
        if (fingerprint) await this.operations.release(fingerprint, owner);
        owners.delete(owner);
      },
    };
  }
}
