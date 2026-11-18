import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import {
  getDeclaredPluginPermissions,
  resetPluginPermissionRegistry,
  setRecordedPermissionOwners,
} from './runtime/plugin-permissions';

describe('PluginModule plugin-declared permissions', () => {
  const fixture = registerPluginModuleFixture();

  afterEach(() => resetPluginPermissionRegistry());

  const writePlugin = (name: string, keys: string[], extra = '') => {
    mkdirSync(join(fixture.root, name, 'dist'), { recursive: true });
    writeFileSync(
      join(fixture.root, name, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '2.0.0-0' },
      }),
    );
    const permissions = keys.map((key) => ({
      key,
      label: { en: key, de: key },
      description: { en: key, de: key },
      defaultRoles: ['resource-manager'],
    }));
    writeFileSync(
      join(fixture.root, name, 'dist', 'index.js'),
      `class M {} module.exports = { default: { permissions: { permissions: ${JSON.stringify(permissions)} }, register: () => { ${extra} return { module: M }; } } };`,
    );
  };

  const statusOf = (name: string) => PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === name);

  it('registers the keys of loaded plugins and quarantines only a plugin that violates the rules', () => {
    writePlugin('a-owner', ['shared.widgets.read', 'shared.widgets.manage']);
    writePlugin('b-collides', ['shared.widgets.read']);
    writePlugin('c-reserved', ['system.widgets.read']);
    writePlugin('d-core', ['resources.read']);
    writePlugin('e-fine', ['fine.things.read']);

    PluginModule.forRoot();

    expect(statusOf('a-owner')?.status).toBe('loaded');
    expect(statusOf('e-fine')?.status).toBe('loaded');
    expect(statusOf('b-collides')).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/already declared by plugin "a-owner"/),
    });
    expect(statusOf('c-reserved')).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/reserved core namespace/),
    });
    expect(statusOf('d-core')).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/reserved core namespace|core permission/),
    });
    expect(getDeclaredPluginPermissions().map(({ key, pluginName }) => `${pluginName}:${key}`)).toEqual([
      'a-owner:shared.widgets.read',
      'a-owner:shared.widgets.manage',
      'e-fine:fine.things.read',
    ]);
  });

  it('rejects a key an earlier boot recorded for another plugin', () => {
    setRecordedPermissionOwners(new Map([['shared.widgets.read', 'uninstalled-owner']]));
    writePlugin('newcomer', ['shared.widgets.read']);

    PluginModule.forRoot();

    expect(statusOf('newcomer')).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/owned by plugin "uninstalled-owner"/),
    });
    expect(getDeclaredPluginPermissions()).toEqual([]);
  });

  it('leaves no keys behind for a plugin whose register() throws', () => {
    writePlugin('throws', ['throws.widgets.read'], 'throw new Error("boom");');

    PluginModule.forRoot();

    expect(statusOf('throws')?.status).toBe('error');
    expect(getDeclaredPluginPermissions()).toEqual([]);
  });
});
