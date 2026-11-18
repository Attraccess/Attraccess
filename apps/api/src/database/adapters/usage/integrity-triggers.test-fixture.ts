import type { DataSource } from 'typeorm';

const INTEGRITY_TRIGGERS = [
  'resource_usage_valid_open_insert',
  'resource_usage_valid_open_update',
  'resource_usage_single_active_per_user_insert',
  'resource_usage_single_active_per_user_update',
];

/**
 * Runs `work` with the open-state and one-session-per-person guards of the usage table switched off, to store the
 * legacy rows (orphans, duplicate sessions) those guards now refuse. The guards are back on afterwards.
 */
export async function withoutIntegrityTriggers<T>(source: DataSource, work: () => Promise<T>): Promise<T> {
  for (const trigger of INTEGRITY_TRIGGERS) {
    await source.query(`ALTER TABLE "resource_usage" DISABLE TRIGGER "${trigger}"`);
  }
  try {
    return await work();
  } finally {
    for (const trigger of INTEGRITY_TRIGGERS) {
      await source.query(`ALTER TABLE "resource_usage" ENABLE TRIGGER "${trigger}"`);
    }
  }
}
