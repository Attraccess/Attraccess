import { MigrationInterface, QueryRunner } from 'typeorm';

// Freeze the supported domains here so later application changes cannot alter this migration.
const supportedDomains = ['administration', 'attractap', 'billing', 'identity', 'project', 'resource', 'sso', 'wago'];
const addedDomains = ['administration', 'project', 'sso'];
const defaultDomains = ['administration', 'attractap', 'identity', 'project', 'resource', 'sso', 'wago'];

function parseDomains(value: string): string[] | undefined {
  try {
    const domains: unknown = JSON.parse(value);
    return Array.isArray(domains) &&
      domains.every((domain) => typeof domain === 'string' && supportedDomains.includes(domain)) &&
      new Set(domains).size === domains.length
      ? domains
      : undefined;
  } catch {
    return undefined;
  }
}

export class FullAuditDomains1784100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const [row]: Array<{ value: string }> = await runner.query(
      'SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?',
      ['audit', 'domains'],
    );
    if (!row) {
      await runner.query('INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)', [
        'audit',
        'domains',
        JSON.stringify(defaultDomains),
      ]);
      return;
    }
    const domains = parseDomains(row.value);
    // Invalid configuration stays invalid and fails closed in readAuditSettings.
    if (!domains) return;
    const next = [...domains, ...addedDomains.filter((domain) => !domains.includes(domain))];
    if (next.length !== domains.length)
      await runner.query('UPDATE "setting" SET "value" = ? WHERE "parent" = ? AND "key" = ?', [
        JSON.stringify(next),
        'audit',
        'domains',
      ]);
  }

  down(): Promise<void> {
    // These domains are already supported before this migration. Keep the current
    // choices: we cannot distinguish additions from existing or later selections.
    return Promise.resolve();
  }
}
