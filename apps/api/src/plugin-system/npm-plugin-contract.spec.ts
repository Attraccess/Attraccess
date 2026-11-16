import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { parseNpmPluginPackage } from './npm/contract-validation';

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
    migrations: 'dist/migrations.js',
    styles: 'frontend/style.css',
    permissions: [PluginPermission.DATABASE_ACCESS],
    sdk: { backend: '^2.0.0', frontend: '^2.0.0' },
  },
};

describe('parseNpmPluginPackage', () => {
  it('maps the npm contract into the existing loader manifest', () => {
    const { manifest } = parseNpmPluginPackage(validPackage, '2.0.0');
    expect(manifest).toMatchObject({
      name: '@attraccess/plugin-example',
      version: '1.2.3',
      permissions: [PluginPermission.DATABASE_ACCESS],
      main: {
        backend: { directory: 'dist', entryPoint: 'index.js' },
        frontend: { directory: 'frontend', entryPoint: 'remoteEntry.js', styles: 'style.css' },
      },
    });
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
