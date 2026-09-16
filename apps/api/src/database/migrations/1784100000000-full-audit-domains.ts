import { MigrationInterface, QueryRunner } from 'typeorm';

// Freeze the core domains here so later application changes cannot alter this migration.
// Plugin-contributed domains (such as historical "wago" entries) never belong in the core
// allowlist; leaving one stored here would fail the settings schema and disable audit reads.
const coreDomains = ['administration', 'attractap', 'billing', 'identity', 'project', 'resource', 'sso'];
// Domains introduced after the audit settings shipped; enable them for preexisting selections.
const addedDomains = ['administration', 'project', 'sso'];

export class FullAuditDomains1784100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const [row]: Array<{ value: string }> = await runner.query(
      'SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?',
      ['audit', 'domains'],
    );
    // A missing row falls back to the application defaults; do not seed one.
    if (!row) return;
    let stored: unknown;
    try {
      stored = JSON.parse(row.value);
    } catch {
      // Invalid configuration stays invalid and fails closed in readAuditSettings.
      return;
    }
    if (!Array.isArray(stored)) return;
    const selected = stored.filter(
      (domain): domain is string => typeof domain === 'string' && coreDomains.includes(domain),
    );
    const value = JSON.stringify([...new Set([...selected, ...addedDomains])]);
    if (value !== row.value)
      await runner.query('UPDATE "setting" SET "value" = ? WHERE "parent" = ? AND "key" = ?', [
        value,
        'audit',
        'domains',
      ]);
  }

  down(): Promise<void> {
    // Stripped plugin entries and added core domains cannot be distinguished from
    // later deliberate choices, so the current selection is kept.
    return Promise.resolve();
  }
}
