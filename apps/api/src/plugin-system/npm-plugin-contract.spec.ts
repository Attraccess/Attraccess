import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { parseNpmPluginPackage } from './npm-plugin-contract';

const validPackage = {
  name: '@attraccess/plugin-shelly',
  version: '1.2.3',
  keywords: ['attraccess-plugin'],
  peerDependencies: {
    '@attraccess/plugins-backend-sdk': '^1.9.0',
    '@attraccess/plugins-frontend-sdk': '^1.9.0',
  },
  attraccess: {
    displayName: 'Shelly',
    host: '^1.9.0',
    backend: 'dist/index.js',
    frontend: 'frontend/remoteEntry.js',
    migrations: 'dist/migrations.js',
    styles: 'frontend/style.css',
    permissions: [PluginPermission.DATABASE_ACCESS],
    sdk: { backend: '^1.9.0', frontend: '^1.9.0' },
  },
};

describe('parseNpmPluginPackage', () => {
  it('maps the npm contract into the existing loader manifest', () => {
    const { manifest } = parseNpmPluginPackage(validPackage, '1.9.0');
    expect(manifest).toMatchObject({
      name: '@attraccess/plugin-shelly', version: '1.2.3', permissions: [PluginPermission.DATABASE_ACCESS],
      main: { backend: { directory: 'dist', entryPoint: 'index.js' }, frontend: { directory: 'frontend', entryPoint: 'remoteEntry.js', styles: 'style.css' } },
    });
  });

  it.each([
    [{ ...validPackage, keywords: [] }],
    [{ ...validPackage, version: '1.2' }],
    [{ ...validPackage, attraccess: { ...validPackage.attraccess, host: '^2.0.0' } }],
    [{ ...validPackage, scripts: { postinstall: 'node setup.js' } }],
    [{ ...validPackage, attraccess: { ...validPackage.attraccess, backend: '../index.js' } }],
    [{ ...validPackage, peerDependencies: { ...validPackage.peerDependencies, '@attraccess/plugins-backend-sdk': '^2.0.0' } }],
  ])('rejects an unsafe or incompatible package', (pkg) => {
    expect(() => parseNpmPluginPackage(pkg, '1.9.0')).toThrow();
  });
});
