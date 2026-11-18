import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { parseNpmPluginPackage } from './npm/contract-validation';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PluginManifestSchema } from './runtime/manifest-schema';

const validPackage = {
  name: '@attraccess/plugin-example',
  version: '1.2.3',
  keywords: ['attraccess-plugin'],
  peerDependencies: {
    '@attraccess/plugins-backend-sdk': '^2.0.0',
    '@attraccess/plugins-frontend-sdk': '^2.0.0',
  },
  attraccess: {
    displayName: 'Example',
    host: '^2.0.0',
    backend: 'dist/index.js',
    frontend: 'frontend/remoteEntry.js',
    styles: 'frontend/style.css',
    dashboardPaths: ['/plugin-report'],
    dashboardWidgets: ['plugin-report-summary'],
    permissions: [PluginPermission.PLUGIN_STORAGE],
    sdk: { backend: '^2.0.0', frontend: '^2.0.0' },
  },
};

describe('parseNpmPluginPackage', () => {
  it('maps the npm contract into the existing loader manifest', () => {
    const { manifest } = parseNpmPluginPackage(validPackage, '2.0.0');
    expect(manifest).toMatchObject({
      name: '@attraccess/plugin-example',
      version: '1.2.3',
      permissions: [PluginPermission.PLUGIN_STORAGE],
      main: {
        backend: { directory: 'dist', entryPoint: 'index.js' },
        frontend: {
          directory: 'frontend',
          entryPoint: 'remoteEntry.js',
          styles: 'style.css',
          dashboardPaths: ['/plugin-report'],
          dashboardWidgets: ['plugin-report-summary'],
        },
      },
    });
  });

  it('carries the license requirement of package.json into the synthesized manifest', () => {
    const license = { required: true, modules: ['wago'] };
    const { manifest } = parseNpmPluginPackage(
      { ...validPackage, attraccess: { ...validPackage.attraccess, license } },
      '2.0.0',
    );
    expect(manifest.license).toEqual(license);
    expect(parseNpmPluginPackage(validPackage, '2.0.0').manifest.license).toBeUndefined();
  });

  it.each(['wago', 'reservations'])('keeps the paid %s module required in both manifests', (name) => {
    // Without this block the host would load the plugin for every license, including the non-profit key.
    const read = (file: string) => JSON.parse(readFileSync(join(__dirname, '../../../plugins', name, file), 'utf8'));
    const pkg = read('package.json');
    const expected = { required: true, modules: [name] };
    expect(PluginManifestSchema.parse(read('plugin.json')).license).toEqual(expected);
    expect(parseNpmPluginPackage(pkg, pkg.attraccess.host.replace(/^\^/, '')).manifest.license).toEqual(expected);
  });

  it('declares the same license block in plugin.json and package.json for every first-party plugin', () => {
    // npm installs build the manifest from package.json, ZIP and directory installs read plugin.json: both must gate.
    const pluginsRoot = join(__dirname, '../../../plugins');
    const plugins = readdirSync(pluginsRoot).filter(
      (name) =>
        existsSync(join(pluginsRoot, name, 'plugin.json')) && existsSync(join(pluginsRoot, name, 'package.json')),
    );
    expect(plugins).toEqual(expect.arrayContaining(['wago', 'reservations']));
    for (const name of plugins) {
      const read = (file: string) => JSON.parse(readFileSync(join(pluginsRoot, name, file), 'utf8'));
      expect({ name, license: read('package.json').attraccess?.license }).toEqual({
        name,
        license: read('plugin.json').license,
      });
    }
  });

  it('rejects an invalid license requirement', () => {
    expect(() =>
      parseNpmPluginPackage(
        { ...validPackage, attraccess: { ...validPackage.attraccess, license: { modules: 'wago' } } },
        '2.0.0',
      ),
    ).toThrow();
  });

  it('rejects dashboard paths outside plain sidebar routes', () => {
    for (const path of ['/kiosk/companion', '/dashboard', 'plugin-report', '/plugin/../admin']) {
      expect(() =>
        parseNpmPluginPackage(
          { ...validPackage, attraccess: { ...validPackage.attraccess, dashboardPaths: [path] } },
          '2.0.0',
        ),
      ).toThrow();
    }
  });

  it('rejects dashboard widget ids that are not lowercase kebab-case', () => {
    for (const id of ['Report', 'report_summary', '-report', 'report--summary', 'a'.repeat(65)]) {
      expect(() =>
        parseNpmPluginPackage(
          { ...validPackage, attraccess: { ...validPackage.attraccess, dashboardWidgets: [id] } },
          '2.0.0',
        ),
      ).toThrow();
    }
  });

  it('accepts unrelated standard npm package manifest fields', () => {
    expect(() =>
      parseNpmPluginPackage(
        {
          ...validPackage,
          main: 'dist/index.js',
          files: ['dist'],
          exports: { '.': './dist/index.js' },
          type: 'commonjs',
          dependencies: { lodash: '^4.17.21' },
          engines: { node: '>=20' },
        },
        '2.0.0',
      ),
    ).not.toThrow();
  });

  it('accepts prerelease hosts covered by the declared compatibility ranges', () => {
    expect(() => parseNpmPluginPackage(validPackage, '2.0.1-beta.1')).not.toThrow();
  });

  it('names the plugin and the migration guide for an SDK 1.x host range, before the host version check', () => {
    const legacy = { ...validPackage, attraccess: { ...validPackage.attraccess, host: '>=1.0.0' } };
    expect(() => parseNpmPluginPackage(legacy, '2.0.0')).toThrow(
      /Plugin @attraccess\/plugin-example .*migrating-to-2/s,
    );
    // A range the host does not even satisfy still gets the SDK 1.x explanation, not a generic one.
    const old = { ...validPackage, attraccess: { ...validPackage.attraccess, host: '^1.11.0' } };
    expect(() => parseNpmPluginPackage(old, '2.0.0')).toThrow(/migrating-to-2/);
  });

  it.each([
    [{ permissions: ['DATABASE_ACCESS'] }, 'DATABASE_ACCESS permission'],
    [{ persistence: { backends: ['sqlite'] } }, 'attraccess.persistence in package.json'],
    [{ migrations: 'dist/migrations.js' }, 'migrations entry (attraccess.migrations in package.json)'],
  ])('refuses a package that still uses the SDK 1.x database contract', (override, message) => {
    const pkg = { ...validPackage, attraccess: { ...validPackage.attraccess, ...override } };
    expect(() => parseNpmPluginPackage(pkg, '2.0.0')).toThrow(message);
    expect(() => parseNpmPluginPackage(pkg, '2.0.0')).toThrow(/Plugin @attraccess\/plugin-example .*migrating-to-2/s);
  });

  it.each([
    [{ ...validPackage, keywords: [] }],
    [{ ...validPackage, version: '1.2' }],
    [{ ...validPackage, attraccess: { ...validPackage.attraccess, host: '^3.0.0' } }],
    [{ ...validPackage, scripts: { postinstall: 'node setup.js' } }],
    [{ ...validPackage, attraccess: { ...validPackage.attraccess, backend: '../index.js' } }],
    [
      {
        ...validPackage,
        peerDependencies: { ...validPackage.peerDependencies, '@attraccess/plugins-backend-sdk': '^3.0.0' },
      },
    ],
  ])('rejects an unsafe or incompatible package', (pkg) => {
    expect(() => parseNpmPluginPackage(pkg, '2.0.0')).toThrow();
  });
});
