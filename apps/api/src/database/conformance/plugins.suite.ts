import { describe, expect, it } from '@jest/globals';
import { PluginFixtureFactory } from './backend-fixture';

export function pluginConformance(name: string, factory: PluginFixtureFactory) {
  describe.each(['legacy', 'v2'] as const)(`${name}: %s plugin migration lifecycle`, (contract) => {
    it('installs, upgrades, retains replacement history, rolls back failure and uninstalls', async () => {
      const fixture = await factory(contract);
      try {
        expect(await fixture.install(1)).toEqual(['Conformance1700000000001']);
        expect(await fixture.install(1)).toEqual([]);
        expect(await fixture.history()).toEqual(['Conformance1700000000001']);
        expect(await fixture.data()).toEqual([{ id: 1, value: 'retained' }]);
        expect(await fixture.install(2)).toEqual(['Conformance1700000000002']);
        const history = await fixture.history();
        expect([...history].sort()).toEqual(['Conformance1700000000001', 'Conformance1700000000002']);
        await expect(fixture.install(3, true)).rejects.toThrow('simulated migration failure');
        expect(await fixture.history()).toEqual(history);
        expect(await fixture.data()).toEqual([{ id: 1, value: 'retained', upgraded: 1 }]);
        expect(await fixture.install(3)).toEqual(['Conformance1700000000003']);
        await expect(fixture.rejectUnsupported()).rejects.toThrow('does not support');
        expect(await fixture.history()).toHaveLength(3);
        expect(await fixture.data()).toEqual([{ id: 1, value: 'retained', upgraded: 1 }]);
        expect(await fixture.uninstall()).toBe(3);
        expect(await fixture.history()).toEqual([]);
        expect(await fixture.install(1)).toEqual(['Conformance1700000000001']);
      } finally {
        await fixture.close();
      }
    });
  });
}

// Implementation fixture: schema code is authored/loaded exactly as an installed CommonJS plugin.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { SqlitePluginMigrations } from '../../plugin-system/persistence/typeorm-adapter';
import { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
export const createSqlitePluginFixture: PluginFixtureFactory = async (contract) => {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-plugin-conformance-'));
  const database = join(directory, 'plugin.sqlite');
  const storage = () => new SqlitePluginMigrations(() => directory, { type: 'sqlite', database });
  const manifest: LoadedPluginManifest = {
    name: 'conformance',
    version: '1.0.0',
    id: 'conformance',
    status: 'loaded',
    error: null,
    attraccessVersion: {},
    permissions: [],
    pluginDirectory: directory,
    main: {},
    ...(contract === 'v2' ? { persistence: { contractVersion: 2 as const, supportedBackends: ['sqlite'] } } : {}),
  };
  let revision = 0;
  const query = async (sql: string) => {
    const connection = await new DataSource({ type: 'sqlite', database }).initialize();
    try {
      return await connection.query(sql);
    } finally {
      await connection.destroy();
    }
  };
  return {
    install: async (version, fail = false) => {
      const classes = [
        `class Conformance1700000000001 {async up(r){await r.query("CREATE TABLE plugin_conformance(id integer PRIMARY KEY, value text NOT NULL)");await r.query("INSERT INTO plugin_conformance VALUES(1,'retained')");}async down(r){await r.query("DROP TABLE plugin_conformance");}}`,
        `class Conformance1700000000002 {async up(r){await r.query("ALTER TABLE plugin_conformance ADD COLUMN upgraded integer NOT NULL DEFAULT 1");}async down(r){await r.query("ALTER TABLE plugin_conformance DROP COLUMN upgraded");}}`,
        `class Conformance1700000000003 {async up(r){await r.query("CREATE TABLE plugin_conformance_extra(id integer)");${fail ? 'throw new Error("simulated migration failure");' : ''}}async down(r){await r.query("DROP TABLE plugin_conformance_extra");}}`,
      ].slice(0, version);
      const names = classes.map((_c, i) => `Conformance170000000000${i + 1}`);
      const entryPoint = `entry-${++revision}.cjs`;
      const exports =
        contract === 'legacy'
          ? names.map((name) => `exports.${name}=${name};`).join('\n')
          : `module.exports.default={register(){return {};},persistence:{contractVersion:2,supportedBackends:['sqlite']},persistenceAdapters:[{backend:'sqlite',migrations:[${names.join(',')}]}]};`;
      await writeFile(join(directory, entryPoint), classes.join('\n') + '\n' + exports);
      manifest.main =
        contract === 'legacy'
          ? { migrations: { directory: '.', entryPoint } }
          : { backend: { directory: '.', entryPoint } };
      return storage().up(manifest);
    },
    history: () => storage().appliedNames(manifest),
    data: () => query('SELECT * FROM plugin_conformance'),
    uninstall: () => storage().down(manifest),
    rejectUnsupported: async () => {
      const unsupported = {
        ...manifest,
        persistence: { contractVersion: 2 as const, supportedBackends: ['postgres'] },
        main: { migrations: { directory: '.', entryPoint: 'must-not-load.cjs' } },
      };
      await storage().up(unsupported);
    },
    close: () => rm(directory, { recursive: true, force: true }),
  };
};
