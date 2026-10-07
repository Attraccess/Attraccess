import { DataSource } from 'typeorm';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoManagedUpdates1780010650000 } from './migrations/1780010650000-add-wago-managed-updates';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('migrates credential/update/operation storage together and refuses destructive downgrade with credentials', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation],
      migrations: [WagoManagedUpdates1780010650000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        "INSERT INTO plugin_wago_managed_access VALUES (1, NULL, '10.0.0.1', 'pin', 'token', 'pending', 'ciphertext', 'key-pin')",
      );
      await expect(db.undoLastMigration()).rejects.toThrow('Retire managed');
    } finally {
      await db.destroy();
    }
  });
}
