import { PluginManifestSchema } from './plugin.manifest';

const BASE = {
  name: 'demo',
  version: '1.0.0',
  main: {
    frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
    backend: { directory: 'dist', entryPoint: 'index.js' },
  },
  attraccessVersion: { min: '1.0.0' },
  permissions: [],
};

describe('PluginManifestSchema migrations entry', () => {
  it('accepts a manifest without a migrations entry', () => {
    const parsed = PluginManifestSchema.parse(BASE);
    expect(parsed.main.migrations).toBeUndefined();
  });

  it('accepts and parses a migrations entry', () => {
    const parsed = PluginManifestSchema.parse({
      ...BASE,
      main: { ...BASE.main, migrations: { directory: 'dist', entryPoint: 'migrations.js' } },
    });
    expect(parsed.main.migrations).toEqual({ directory: 'dist', entryPoint: 'migrations.js' });
  });

  it('rejects a malformed migrations entry', () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...BASE,
        main: { ...BASE.main, migrations: { directory: 'dist' } },
      })
    ).toThrow();
  });
});
