import { Interval } from '@nestjs/schedule';
import { AuditTransactionHooksImplementation } from './audit-transaction-hooks';
import { readAuditSettings } from './audit.config';
export abstract class AuditRetentionImplementation extends AuditTransactionHooksImplementation {
  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    const storage = this.storage;
    if (this.stopping || !storage?.isInitialized || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.sqliteDate(this.cutoff(config.retention_days));
      while (!this.stopping) {
        const hasOverflow = await this.hasPasswordPolicyOverflow();
        const count = await this.serializeStorageWrite(async () => {
          if (this.stopping) return 0;
          return storage.transaction(async (manager) => {
            const rows = await manager.query<{ id: number }[]>(
              'SELECT id FROM audit_log WHERE at < ? ORDER BY at, id LIMIT 1000',
              [cutoff],
            );
            if (rows.length === 0) return 0;
            const ids = rows.map(({ id }) => id);
            const placeholders = ids.map(() => '?').join(', ');
            if (hasOverflow) {
              await manager.query(
                `DELETE FROM password_policy_audit_overflow
                WHERE legacyAuditId IN (
                  SELECT json_extract(details, '$.legacyAuditId') FROM audit_log WHERE id IN (${placeholders})
                )`,
                ids,
              );
            }
            await manager.query(`DELETE FROM audit_log WHERE id IN (${placeholders})`, ids);
            return rows.length;
          });
        });
        if (count > 0) this.logger.log(`Deleted ${count} expired audit rows`);
        if (count < 1000) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } catch {
      // Retention must not affect domain operations or expose database errors.
    } finally {
      this.cleaning = false;
    }
  }
}
