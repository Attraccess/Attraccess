import {
  getDeclaredPluginPermissions,
  preparePluginPermissions,
  resetPluginPermissionRegistry,
  setRecordedPermissionOwners,
} from './plugin-permissions';

const permission = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  label: { en: 'Label', de: 'Bezeichnung' },
  description: { en: 'Description', de: 'Beschreibung' },
  ...extra,
});

describe('plugin permission registry', () => {
  afterEach(() => resetPluginPermissionRegistry());

  it('ignores plugins that declare no permissions', () => {
    preparePluginPermissions('plain', undefined).register();
    expect(getDeclaredPluginPermissions()).toEqual([]);
  });

  it('registers validated keys only once register() runs, defaulting the category to the plugin name', () => {
    const prepared = preparePluginPermissions('acme', {
      permissions: [permission('acme.widgets.read', { defaultRoles: ['resource-manager', 'resource-manager'] })],
    });
    expect(getDeclaredPluginPermissions()).toEqual([]);

    prepared.register();

    expect(getDeclaredPluginPermissions()).toEqual([
      {
        key: 'acme.widgets.read',
        pluginName: 'acme',
        label: { en: 'Label', de: 'Bezeichnung' },
        description: { en: 'Description', de: 'Beschreibung' },
        category: { en: 'acme', de: 'acme' },
        defaultRoles: ['resource-manager'],
      },
    ]);
  });

  it('replaces a plugin registration instead of accumulating dropped keys', () => {
    preparePluginPermissions('acme', {
      permissions: [permission('acme.a.read'), permission('acme.b.read')],
    }).register();
    preparePluginPermissions('acme', { permissions: [permission('acme.a.read')] }).register();
    expect(getDeclaredPluginPermissions().map((entry) => entry.key)).toEqual(['acme.a.read']);
  });

  it.each([
    ['bad format', { permissions: [permission('Acme.Widgets')] }, /must match/],
    ['single segment', { permissions: [permission('acme')] }, /must match/],
    ['too long', { permissions: [permission(`acme.${'a'.repeat(100)}`)] }, /at most 100/],
    ['reserved namespace', { permissions: [permission('system.acme.read')] }, /reserved core namespace "system\."/],
    ['duplicate', { permissions: [permission('acme.a.read'), permission('acme.a.read')] }, /declared twice/],
    [
      'non-system role',
      { permissions: [permission('acme.a.read', { defaultRoles: ['custom'] })] },
      /"custom" is not a system role/,
    ],
    [
      'missing translation',
      { permissions: [permission('acme.a.read', { label: { en: 'Only English' } })] },
      /label\.de/,
    ],
    ['empty list', { permissions: [] }, /non-empty/],
  ])('rejects a declaration with %s', (_case, declaration, message) => {
    expect(() => preparePluginPermissions('acme', declaration)).toThrow(message);
    expect(() => preparePluginPermissions('acme', declaration)).toThrow(/Plugin acme declares invalid permissions/);
  });

  it('rejects a core key, even one only the database knows', () => {
    setRecordedPermissionOwners(new Map([['reports.future.read', null]]));
    expect(() => preparePluginPermissions('acme', { permissions: [permission('reports.future.read')] })).toThrow(
      /cannot declare permission "reports.future.read": it is a core permission/,
    );
  });

  it('rejects a key another plugin declared in this boot, first registrant wins', () => {
    preparePluginPermissions('first', { permissions: [permission('shared.widgets.read')] }).register();

    expect(() => preparePluginPermissions('second', { permissions: [permission('shared.widgets.read')] })).toThrow(
      /: it is already declared by plugin "first"/,
    );
    expect(getDeclaredPluginPermissions().map((entry) => entry.pluginName)).toEqual(['first']);
  });

  it('rejects a key another plugin owns from an earlier boot, but lets the owner declare it again', () => {
    setRecordedPermissionOwners(new Map([['shared.widgets.read', 'first']]));

    expect(() => preparePluginPermissions('second', { permissions: [permission('shared.widgets.read')] })).toThrow(
      /owned by plugin "first"/,
    );
    expect(() => preparePluginPermissions('first', { permissions: [permission('shared.widgets.read')] })).not.toThrow();
  });
  it('validates and registers one snapshot, so a getter cannot swap the key after the checks', () => {
    let reads = 0;
    const tricky = {
      ...permission('acme.widgets.read'),
      get key() {
        reads += 1;
        return reads === 1 ? 'acme.widgets.read' : 'users.read';
      },
    };
    preparePluginPermissions('acme', { permissions: [tricky] }).register();
    expect(getDeclaredPluginPermissions().map((entry) => entry.key)).toEqual(['acme.widgets.read']);
  });
});
