import { PluginManifestSchema } from './plugin.manifest';
import { LoadedPluginManifest } from './runtime/manifest';

const BASE = {
  name: 'demo',
  version: '1.0.0',
  main: {
    frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
    backend: { directory: 'dist', entryPoint: 'index.js' },
  },
  attraccessVersion: { min: '2.0.0-0' },
  permissions: [],
};

describe('PluginManifestSchema SDK 2.0 contract', () => {
  it('knows PLUGIN_STORAGE and no longer knows the removed database permissions', () => {
    expect(PluginManifestSchema.parse({ ...BASE, permissions: ['PLUGIN_STORAGE'] }).permissions).toEqual([
      'PLUGIN_STORAGE',
    ]);
    for (const removed of ['DATABASE_ACCESS', 'PLUGIN_ENGINE_ACCESS']) {
      expect(() => PluginManifestSchema.parse({ ...BASE, permissions: [removed] })).toThrow();
    }
  });

  it('has no migrations entry and no persistence field: they are dropped, never parsed', () => {
    const parsed = PluginManifestSchema.parse({
      ...BASE,
      main: { ...BASE.main, migrations: { directory: 'dist', entryPoint: 'migrations.js' } },
      persistence: { backends: ['sqlite'] },
    });
    expect(parsed.main).not.toHaveProperty('migrations');
    expect(parsed).not.toHaveProperty('persistence');
  });
});

describe('LoadedPluginManifest API contract', () => {
  it('documents no persistence field: SDK 2.0 removed the engine list, so the API never returns one', () => {
    const documented: string[] = Reflect.getMetadata('swagger/apiModelPropertiesArray', LoadedPluginManifest.prototype);
    expect(documented).toContain(':permissions');
    expect(documented).not.toContain(':persistence');
  });
});

describe('PluginManifestSchema dashboard paths', () => {
  const withDashboardPaths = (dashboardPaths: string[]) => ({
    ...BASE,
    main: { ...BASE.main, frontend: { ...BASE.main.frontend, dashboardPaths } },
  });

  it('accepts sidebar route paths', () => {
    const parsed = PluginManifestSchema.parse(withDashboardPaths(['/plugin-report', '/reservations/manage']));
    expect(parsed.main.frontend?.dashboardPaths).toEqual(['/plugin-report', '/reservations/manage']);
  });

  it('accepts a path that only starts like a reserved one', () => {
    expect(PluginManifestSchema.parse(withDashboardPaths(['/kiosk-guide'])).main.frontend?.dashboardPaths).toEqual([
      '/kiosk-guide',
    ]);
  });

  it.each([
    '/kiosk',
    '/Kiosk',
    '/kiosk/companion',
    '/dashboard',
    '/DASHBOARD',
    '/dashboard/x',
    'https://example.com',
    '/foo/../bar',
    '/',
    '/a b',
  ])('rejects %s', (path) => {
    expect(() => PluginManifestSchema.parse(withDashboardPaths([path]))).toThrow();
  });
});

describe('PluginManifestSchema dashboard widgets', () => {
  const withDashboardWidgets = (dashboardWidgets: string[]) => ({
    ...BASE,
    main: { ...BASE.main, frontend: { ...BASE.main.frontend, dashboardWidgets } },
  });

  it('accepts kebab-case widget ids and keeps manifests without them valid', () => {
    expect(
      PluginManifestSchema.parse(withDashboardWidgets(['reservations-upcoming', 'report2'])).main.frontend
        ?.dashboardWidgets,
    ).toEqual(['reservations-upcoming', 'report2']);
    expect(PluginManifestSchema.parse(BASE).main.frontend?.dashboardWidgets).toBeUndefined();
  });

  it.each(['Report', 'report_summary', '-report', 'report-', 'report--summary', '/report', '', 'a'.repeat(65)])(
    'rejects %j',
    (id) => {
      expect(() => PluginManifestSchema.parse(withDashboardWidgets([id]))).toThrow();
    },
  );
});
