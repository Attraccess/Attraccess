import { describe, expect, it } from '@jest/globals';
import type { LegacyVersion, UpgradeFixtureFactory } from './backend-fixture';

export function legacyUpgradeConformance(name: string, factory: UpgradeFixtureFactory): void {
  describe(`${name}: released schema upgrades`, () => {
    it.each<LegacyVersion>(['before-usage-integrity', 'pre-refactor'])(
      'preserves historical values and relationships from %s',
      async (version) => {
        const fixture = await factory(version);
        try {
          const before = await fixture.snapshot();
          // Nonempty sentinels keep a missing seed or empty query from passing a continuity comparison.
          for (const rows of Object.values(before)) expect(rows).toHaveLength(1);
          expect(before.identity[0]).toMatchObject({ id: 901, balance: '123456789' });
          expect(before.pluginData[0]).toEqual({ id: 914, bytes: '00FF018000' });
          expect(before.meter[0]).toMatchObject({ latest: '900719925474099312345', consumed: '900719925474099312345' });
          const priorMigrations = await fixture.appliedMigrations();
          if (version === 'before-usage-integrity') {
            fixture.interruptNextUpgrade();
            await expect(fixture.upgrade()).rejects.toThrow('fixture interrupted');
            await expect(fixture.appliedMigrations()).resolves.toEqual(priorMigrations);
            await expect(fixture.snapshot()).resolves.toEqual(before);
          }
          const applied = await fixture.upgrade();
          if (version === 'before-usage-integrity') expect(applied).toContain('ResourceUsageIntegrity1790100000000');
          else expect(applied).toEqual([]);
          const afterMigrations = await fixture.appliedMigrations();
          expect(afterMigrations).toEqual(expect.arrayContaining([...priorMigrations]));
          expect(afterMigrations).toHaveLength(priorMigrations.length + applied.length);
          expect(new Set(afterMigrations).size).toBe(afterMigrations.length);
          await expect(fixture.snapshot()).resolves.toEqual(before);
          await expect(fixture.integrityViolations()).resolves.toEqual([]);
          expect(await fixture.durationInMinutes()).toBeCloseTo(10, 5);
          await expect(fixture.tryRewriteAudit()).rejects.toThrow('Audit rows are immutable');
          await expect(fixture.changeLedgerAmount(17)).resolves.toBe('17');
          await expect(fixture.changeLedgerAmount(123456789)).resolves.toBe('123456789');
          // A second boot neither duplicates history nor changes balances, secrets or observations.
          await expect(fixture.upgrade()).resolves.toEqual([]);
          await expect(fixture.snapshot()).resolves.toEqual(before);
        } finally {
          await fixture.close();
        }
      },
      // Historical migrations run inside these cases, including with CI coverage instrumentation.
      60_000,
    );
  });
}
