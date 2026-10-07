import { RuntimeUpdateRecord } from './wago-runtime-update-contracts';
export async function advanceRuntimeRetry(
  record: RuntimeUpdateRecord | null,
  retry: boolean,
  persist: (record: RuntimeUpdateRecord) => Promise<void>,
): Promise<void> {
  if (retry && record && (['blocked', 'failed', 'recovery_required'].includes(record.phase) || record.cleanupRetryAt)) {
    // Administrator retry only advances deadlines under the shared lease;
    // retained rollback/acceptance receipts still run before new work.
    record.retryAt = 0;
    record.cleanupRetryAt = 0;
    await persist(record);
  }
}
