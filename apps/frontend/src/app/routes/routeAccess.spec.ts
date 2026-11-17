import { describe, expect, it } from 'vitest';
import { hasRequiredPermissions } from './routeAccess';

function holder(...granted: string[]) {
  return (permission: string) => granted.includes(permission);
}

describe('hasRequiredPermissions', () => {
  it('accepts a single permission the user holds and rejects one they do not', () => {
    expect(hasRequiredPermissions('system.sso.manage', holder('system.sso.manage'))).toBe(true);
    expect(hasRequiredPermissions('system.sso.manage', holder('system.plugins.manage'))).toBe(false);
  });

  it('treats an array as ANY, not ALL', () => {
    // The whole point of the array form: one of the listed keys is enough. Under the previous
    // `.every()` reading this operator was locked out of a page they can use.
    const gate = ['system.settings.manage', 'system.sso.manage', 'system.plugins.manage'];

    expect(hasRequiredPermissions(gate, holder('system.sso.manage'))).toBe(true);
    expect(hasRequiredPermissions(gate, holder('system.plugins.manage'))).toBe(true);
    expect(hasRequiredPermissions(gate, holder('system.settings.manage'))).toBe(true);
    expect(hasRequiredPermissions(gate, holder('system.settings.manage', 'system.sso.manage'))).toBe(true);
  });

  it('rejects when the user holds none of the listed permissions', () => {
    expect(hasRequiredPermissions(['system.sso.manage', 'system.plugins.manage'], holder('users.read'))).toBe(false);
  });

  it('grants nobody access for an empty gate', () => {
    // "No permission opens this" must not read as "every permission opens this".
    expect(hasRequiredPermissions([], holder('system.settings.manage'))).toBe(false);
  });

  it('gates on plugin-declared keys like core keys', () => {
    const gate = ['matter.devices.read', 'thread.network.read'];

    expect(hasRequiredPermissions(gate, holder('thread.network.read'))).toBe(true);
    expect(hasRequiredPermissions('matter.devices.read', holder('matter.devices.read'))).toBe(true);
    expect(hasRequiredPermissions(gate, holder('system.plugins.manage'))).toBe(false);
  });
});
