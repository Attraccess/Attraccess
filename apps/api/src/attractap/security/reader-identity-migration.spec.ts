import { DataSource } from 'typeorm';
import * as registry from '../../database/migrations';
import { Attractap, AttractapReaderIdentity, entities, NFCCard } from '@attraccess/database-entities';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const migrationName = 'AttractapReaderIdentity1792200000000';
// Discover through exactly the same explicit export registry used by API startup.
const migrations = Object.values(registry).filter((migration) => migration.name === migrationName);

describe('registered reader identity migration', () => {
  it('upgrades the full existing schema and restarts without changing readers or card slots', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'reader-identity-migration-'));
    const config = {
      type: 'sqlite' as const,
      database: join(directory, 'upgrade.sqlite'),
      entities: Object.values(entities),
      migrationsRun: true,
      synchronize: false,
    };
    let source: DataSource | undefined;
    try {
      source = await new DataSource({
        ...config,
        migrations: Object.values(registry).filter((migration) => migration.name !== migrationName),
      }).initialize();
      const reader = await source.getRepository(Attractap).save({ name: 'Existing reader', apiTokenHash: 'hash' });
      const card = await source.getRepository(NFCCard).save({
        uid: '04010203040506',
        key: 'legacy ciphertext',
        keyNo: 2,
        isActive: true,
      });
      await source.destroy();
      source = await new DataSource({ ...config, migrations: Object.values(registry) }).initialize();
      expect(await source.getRepository(Attractap).findOneByOrFail({ id: reader.id })).toEqual(reader);
      expect(await source.getRepository(NFCCard).findOneByOrFail({ id: card.id })).toEqual(card);
      expect(await source.getRepository(AttractapReaderIdentity).count()).toBe(0);
      const identity = await source.getRepository(AttractapReaderIdentity).save({
        readerId: reader.id,
        certificateFingerprint: 'certificate',
        publicKeyFingerprint: 'public-key',
        certificatePem: 'public cert',
        installationId: 'installation',
        generation: 1,
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2027-01-01'),
        enrollmentClass: 'production',
        manifestDigest: 'manifest',
        revokedAt: null,
        retiredAt: null,
      });
      await source.destroy();
      source = await new DataSource({ ...config, migrations: Object.values(registry) }).initialize();
      expect(await source.showMigrations()).toBe(false);
      expect(await source.runMigrations()).toEqual([]);
      expect(await source.getRepository(AttractapReaderIdentity).findOneByOrFail({ id: identity.id })).toEqual(
        identity,
      );
      expect(await source.getRepository(Attractap).findOneByOrFail({ id: reader.id })).toEqual(reader);
      expect(await source.getRepository(NFCCard).findOneByOrFail({ id: card.id })).toEqual(card);
      await source.undoLastMigration();
      expect(await source.showMigrations()).toBe(true);
      expect(await source.getRepository(Attractap).findOneByOrFail({ id: reader.id })).toEqual(reader);
      expect(await source.getRepository(NFCCard).findOneByOrFail({ id: card.id })).toEqual(card);
      expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([migrationName]);
      expect(await source.getRepository(AttractapReaderIdentity).count()).toBe(0);
      expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      if (source?.isInitialized) await source.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('allows only one owner when separate database connections claim the same public key concurrently', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'reader-ownership-race-'));
    const database = join(directory, 'race.sqlite');
    const first = await new DataSource({ type: 'sqlite', database, migrations }).initialize();
    let second: DataSource | undefined;
    try {
      await first.query('PRAGMA journal_mode=WAL');
      await first.query('CREATE TABLE attractap(id integer PRIMARY KEY)');
      await first.query('INSERT INTO attractap VALUES (17), (18)');
      await first.runMigrations();
      second = await new DataSource({ type: 'sqlite', database }).initialize();
      await first.query('PRAGMA busy_timeout=5000');
      await second.query('PRAGMA busy_timeout=5000');
      const claim = (connection: DataSource, reader: number) =>
        connection.query(
          `INSERT INTO attractap_reader_identity
        (readerId, certificateFingerprint, publicKeyFingerprint, certificatePem, installationId,
         generation, validFrom, validUntil, enrollmentClass, manifestDigest)
        VALUES (?, ?, 'shared-key', 'public', 'installation', 1, '2026-01-01', '2027-01-01', 'development', 'manifest')`,
          [reader, 'certificate-' + reader],
        );
      const results = await Promise.allSettled([claim(first, 17), claim(second, 18)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const denied = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(String(denied.reason)).toMatch(/belongs to another/);
      expect(await first.query('SELECT publicKeyFingerprint FROM attractap_reader_identity')).toEqual([
        { publicKeyFingerprint: 'shared-key' },
      ]);
      expect(await first.query('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      if (second?.isInitialized) await second.destroy();
      await first.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('is discovered by fresh API startup with the complete migration registry', async () => {
    const source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(registry),
      migrationsRun: true,
      synchronize: false,
    }).initialize();
    try {
      expect(await source.showMigrations()).toBe(false);
      expect(await source.query('SELECT * FROM attractap_reader_identity')).toEqual([]);
      expect(await source.query('SELECT name FROM migrations WHERE name = ?', [migrationName])).toEqual([
        { name: migrationName },
      ]);
      expect(await source.runMigrations()).toEqual([]);
    } finally {
      await source.destroy();
    }
  }, 30_000);

  it.each([false, true])('runs once and preserves existing data (existing reader: %s)', async (existing) => {
    expect(migrations).toHaveLength(1);
    const source = await new DataSource({ type: 'sqlite', database: ':memory:', migrations }).initialize();
    try {
      await source.query('CREATE TABLE attractap(id integer PRIMARY KEY, name text, apiTokenHash text)');
      await source.query('CREATE TABLE nfc_card(id integer PRIMARY KEY, uid text, key text, keyNo integer)');
      if (existing) {
        await source.query("INSERT INTO attractap VALUES (17, 'Existing reader', 'existing hash')");
        await source.query("INSERT INTO nfc_card VALUES (23, '04010203040506', 'encrypted legacy value', 2)");
      }
      const readers = await source.query('SELECT * FROM attractap');
      const cards = await source.query('SELECT * FROM nfc_card');
      expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([migrationName]);
      expect(await source.runMigrations()).toEqual([]);
      expect(await source.showMigrations()).toBe(false);
      expect(await source.query('SELECT * FROM attractap')).toEqual(readers);
      expect(await source.query('SELECT * FROM nfc_card')).toEqual(cards);
      expect(await source.query('SELECT * FROM attractap_reader_identity')).toEqual([]);

      if (!existing) await source.query("INSERT INTO attractap VALUES (17, 'New reader', 'new hash')");
      const insert = (certificate = 'cert', key = 'key', generation = 1, reader = 17, enrollment = 'production') =>
        source.query(
          `INSERT INTO attractap_reader_identity
          (readerId, certificateFingerprint, publicKeyFingerprint, certificatePem, installationId,
           generation, validFrom, validUntil, enrollmentClass, manifestDigest)
          VALUES (?, ?, ?, 'public certificate', 'installation', ?, '2026-01-01', '2027-01-01', ?, 'manifest')`,
          [reader, certificate, key, generation, enrollment],
        );
      await insert();
      await expect(insert('cert', 'other-key', 2)).rejects.toThrow(/UNIQUE/);
      await insert('renewed-cert', 'key', 2);
      await source.query("INSERT INTO attractap VALUES (18, 'Other reader', 'hash')");
      await source.query("UPDATE attractap_reader_identity SET revokedAt = '2026-02-01'");
      await expect(insert('other-cert', 'key', 1, 18)).rejects.toThrow(/belongs to another/);
      await expect(source.query('UPDATE attractap_reader_identity SET readerId = 18')).rejects.toThrow(/immutable/);
      await expect(
        source.query("UPDATE attractap_reader_identity SET publicKeyFingerprint = 'replacement'"),
      ).rejects.toThrow(/immutable/);
      await expect(insert('other-cert', 'other-key', 1)).rejects.toThrow(/UNIQUE/);
      await expect(insert('other-cert', 'other-key', 0)).rejects.toThrow(/CHECK/);
      await expect(insert('other-cert', 'other-key', 2, 999)).rejects.toThrow(/FOREIGN KEY/);
      await expect(insert('other-cert', 'other-key', 2, 17, 'demo')).rejects.toThrow(/CHECK/);
      await expect(source.query('UPDATE attractap_reader_identity SET validUntil = validFrom')).rejects.toThrow(
        /CHECK/,
      );
      await source.query('DELETE FROM attractap WHERE id = 17');
      expect(await source.query('SELECT * FROM attractap_reader_identity')).toEqual([]);
      await source.undoLastMigration();
      expect(await source.showMigrations()).toBe(true);
      expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([migrationName]);
      expect(await source.runMigrations()).toEqual([]);
      expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
      expect(await source.query('SELECT * FROM nfc_card')).toEqual(cards);
    } finally {
      await source.destroy();
    }
  });
});
