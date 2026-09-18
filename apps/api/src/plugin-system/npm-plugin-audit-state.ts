import { existsSync } from 'fs';
import { readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface PendingNpmPluginAudit {
  operationId: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  details: Record<string, string | number>;
  migrationOutcome: 'pending-restart' | 'succeeded' | 'failed' | 'not-applicable';
}

/** Boot migrations run before Nest/audit storage exists. Retain only their scalar result
 * beside the initiating operation so the host can record it after its database opens. */
export async function recordNpmBootMigrationOutcome(
  pluginRoot: string,
  name: string,
  version: string,
  outcome: PendingNpmPluginAudit['migrationOutcome'],
): Promise<void> {
  const path = join(pluginRoot, '.npm-plugin-state.json');
  if (!existsSync(path)) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const records = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(records)) return;
    const record = records.find((item) => item.name === name && item.version === version && item.pendingAudit);
    if (!record) return;
    record.pendingAudit.migrationOutcome = outcome;
    await writeFile(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  } catch {
    /* An audit observation must not prevent host startup. */
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
