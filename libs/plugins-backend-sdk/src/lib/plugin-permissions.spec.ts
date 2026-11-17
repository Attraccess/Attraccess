import { Auth, AuthAny, SessionAuth } from './auth-decorator';
import {
  definePluginPermissions,
  PluginPermissionKey,
  pluginPermissionKeyError,
  validatePluginPermissionsDeclaration,
} from './plugin-permissions';

const PERMISSIONS = definePluginPermissions({
  category: { en: 'Widgets', de: 'Widgets' },
  permissions: [
    {
      key: 'acme.widgets.read',
      label: { en: 'View widgets', de: 'Widgets ansehen' },
      description: { en: 'Lists widgets', de: 'Listet Widgets' },
      defaultRoles: ['administrator', 'resource-manager'],
    },
    {
      key: 'acme.widgets.manage',
      label: { en: 'Manage widgets', de: 'Widgets verwalten' },
      description: { en: 'Changes widgets', de: 'Ändert Widgets' },
    },
  ],
});

describe('definePluginPermissions', () => {
  it('returns the declaration with its keys', () => {
    expect(PERMISSIONS.keys).toEqual({
      'acme.widgets.read': 'acme.widgets.read',
      'acme.widgets.manage': 'acme.widgets.manage',
    });
    expect(validatePluginPermissionsDeclaration(PERMISSIONS)).toBe(PERMISSIONS);
  });

  it('types declared keys for the auth decorators without casts', () => {
    const read: PluginPermissionKey<'acme.widgets.read'> = PERMISSIONS.keys['acme.widgets.read'];
    class Controller {
      @Auth(read, 'resources.read')
      a(): void {
        return undefined;
      }
      @AuthAny(PERMISSIONS.keys['acme.widgets.manage'])
      b(): void {
        return undefined;
      }
      @SessionAuth(read)
      c(): void {
        return undefined;
      }
    }
    expect(new Controller()).toBeDefined();
    // @ts-expect-error a bare string is neither a core key nor a declared plugin key
    Auth('acme.widgets.read' as string);
  });
});

describe('pluginPermissionKeyError', () => {
  it.each(['acme.read', 'acme-tools.widgets.read', 'a1.b2'])('accepts %s', (key) => {
    expect(pluginPermissionKeyError(key)).toBeNull();
  });

  it.each([
    ['acme', /must match/],
    ['Acme.read', /must match/],
    ['acme..read', /must match/],
    ['1acme.read', /must match/],
    ['acme.read.', /must match/],
    [`acme.${'x'.repeat(96)}`, /at most 100/],
    ['resources.widgets.read', /"resources\."/],
    ['users.widgets', /"users\."/],
    ['system.widgets', /"system\."/],
    ['billing.widgets', /"billing\."/],
    [42, /must match/],
  ])('rejects %s', (key, message) => {
    expect(pluginPermissionKeyError(key)).toMatch(message);
  });
});

describe('validatePluginPermissionsDeclaration', () => {
  const entry = { key: 'acme.a.read', label: { en: 'A', de: 'A' }, description: { en: 'A', de: 'A' } };

  it.each([
    ['not an object', null, /plain object/],
    ['no permissions', {}, /non-empty array/],
    ['bad category', { category: { en: 'A' }, permissions: [entry] }, /category\.de/],
    ['entry not an object', { permissions: ['acme.a.read'] }, /plain object/],
    ['unknown property', { permissions: [{ ...entry, grantTo: [] }] }, /unknown property "grantTo"/],
    ['blank label', { permissions: [{ ...entry, label: { en: ' ', de: 'A' } }] }, /label\.en/],
    ['long description', { permissions: [{ ...entry, description: { en: 'x'.repeat(501), de: 'A' } }] }, /1-500/],
    ['defaultRoles not an array', { permissions: [{ ...entry, defaultRoles: 'administrator' }] }, /must be an array/],
    ['too many keys', { permissions: Array.from({ length: 65 }, (_, i) => ({ ...entry, key: `acme.k${i}` })) }, /64/],
  ])('rejects %s', (_case, declaration, message) => {
    expect(() => validatePluginPermissionsDeclaration(declaration)).toThrow(message);
  });
});
