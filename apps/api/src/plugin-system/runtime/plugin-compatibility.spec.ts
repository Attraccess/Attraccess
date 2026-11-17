import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertHostRangeTargetsSdk2,
  assertBundleCompatible,
  assertManifestCompatible,
  assertNoRemovedContract,
  findForbiddenImports,
  assertPluginTargetsSdk2,
  PLUGIN_MIGRATION_GUIDE_URL,
  PluginIncompatibleError,
} from './plugin-compatibility';

describe('plugin SDK 2.0 compatibility gate', () => {
  it.each(['2.0.0-0', '2.0.0', '2.3.1', '3.0.0-beta.1'])('accepts attraccessVersion.min %s', (min) => {
    expect(() => assertPluginTargetsSdk2('p', min)).not.toThrow();
  });

  it.each(['1.11.0-0', '1.0.0', '1.99.0', 'not-a-version', undefined])(
    'refuses attraccessVersion.min %s, naming the plugin and linking the guide',
    (min) => {
      const run = () => assertPluginTargetsSdk2('legacy-plugin', min);
      expect(run).toThrow(PluginIncompatibleError);
      expect(run).toThrow(/legacy-plugin/);
      expect(run).toThrow(PLUGIN_MIGRATION_GUIDE_URL);
    },
  );

  it('judges npm host ranges by their lowest allowed version', () => {
    expect(() => assertHostRangeTargetsSdk2('p', '>=2.0.0-0')).not.toThrow();
    expect(() => assertHostRangeTargetsSdk2('p', '^2.1.0')).not.toThrow();
    expect(() => assertHostRangeTargetsSdk2('p', '*')).toThrow(PluginIncompatibleError);
    expect(() => assertHostRangeTargetsSdk2('p', '^1.9.0')).toThrow(PluginIncompatibleError);
    expect(() => assertHostRangeTargetsSdk2('p', 'garbage')).toThrow(PluginIncompatibleError);
  });

  it('does not echo an unusable plugin name from an untrusted manifest', () => {
    expect(() => assertPluginTargetsSdk2('<script>alert(1)</script>', '1.0.0')).toThrow(/\(unnamed plugin\)/);
  });

  describe('removed SDK 1.x database contract', () => {
    const manifest = { name: 'legacy-plugin', attraccessVersion: { min: '2.0.0-0' } };

    it('accepts a plugin that asks for PLUGIN_STORAGE', () => {
      expect(() => assertManifestCompatible({ ...manifest, permissions: ['PLUGIN_STORAGE'] })).not.toThrow();
    });

    it.each([
      ['the DATABASE_ACCESS permission', { permissions: ['DATABASE_ACCESS'] }, /DATABASE_ACCESS permission/],
      ['the PLUGIN_ENGINE_ACCESS permission', { permissions: ['PLUGIN_ENGINE_ACCESS'] }, /PLUGIN_ENGINE_ACCESS/],
      ['persistence.backends', { persistence: { backends: ['sqlite'] } }, /persistence\.backends/],
      [
        'a legacy migrations entry',
        { main: { migrations: { directory: 'd', entryPoint: 'm.js' } } },
        /migrations entry/,
      ],
    ])('refuses %s, naming the plugin and linking the guide', (_label, extra, reason) => {
      const run = () => assertManifestCompatible({ ...manifest, ...extra });
      expect(run).toThrow(PluginIncompatibleError);
      expect(run).toThrow(/legacy-plugin/);
      expect(run).toThrow(reason);
      expect(run).toThrow(PLUGIN_MIGRATION_GUIDE_URL);
    });

    it('checks the raw fields of a package before any schema sees them', () => {
      expect(() => assertNoRemovedContract('p', {})).not.toThrow();
      expect(() => assertNoRemovedContract('p', { migrations: 'dist/migrations.js' })).toThrow(PluginIncompatibleError);
    });
  });

  describe('bundle imports', () => {
    it.each([
      ['require("typeorm")', 'typeorm'],
      ["const { DataSource } = require('typeorm/data-source');", 'typeorm'],
      ["import { Repository } from '@nestjs/typeorm';", '@nestjs/typeorm'],
      ['module.exports = require(`sqlite3`);', 'sqlite3'],
      ["import x from 'better-sqlite3'", 'better-sqlite3'],
      ["require('pg')", 'pg'],
      ["require('pg/lib/client')", 'pg'],
      ["require('mysql2/promise')", 'mysql2'],
      ["import('node:sqlite')", 'node:sqlite'],
      ["require('@attraccess/plugins-backend-sdk/sqlite')", '@attraccess/plugins-backend-sdk/sqlite'],
      ["require('@attraccess/database-entities')", '@attraccess/database-entities'],
    ])('finds %s', (source, module) => {
      expect(findForbiddenImports(source)).toEqual([module]);
    });

    it.each([
      "require('@nestjs/common')",
      "require('@attraccess/plugins-backend-sdk')",
      "require('pgp')",
      "require('typeorm-helper')",
      "const text = 'we do not use pg here';",
    ])('lets %s pass', (source) => {
      expect(findForbiddenImports(source)).toEqual([]);
    });

    describe('on disk', () => {
      let root: string;
      beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'bundle-scan-'));
      });
      afterEach(() => rmSync(root, { recursive: true, force: true }));

      it('refuses a bundle chunk that imports a database package, naming plugin, file and guide', () => {
        mkdirSync(join(root, 'chunks'));
        writeFileSync(join(root, 'index.js'), "module.exports = require('./chunks/a.js');");
        writeFileSync(join(root, 'chunks', 'a.js'), "const orm = require('typeorm');");
        const run = () => assertBundleCompatible('db-plugin', root);
        expect(run).toThrow(PluginIncompatibleError);
        expect(run).toThrow(/db-plugin.*"typeorm".*a\.js.*migrating-to-2/s);
      });

      it('accepts a clean bundle, ignores node_modules and a missing directory', () => {
        writeFileSync(join(root, 'index.js'), "require('@nestjs/common');");
        mkdirSync(join(root, 'node_modules'));
        writeFileSync(join(root, 'node_modules', 'vendored.js'), "require('pg');");
        expect(() => assertBundleCompatible('p', root)).not.toThrow();
        expect(() => assertBundleCompatible('p', join(root, 'missing'))).not.toThrow();
      });
    });
  });
});
