import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import { createTransactionScope, handleOfScope } from './plugin-transaction-scope';

describe('plugin transaction scope', () => {
  it('hides the engine handle: the plugin sees only isOpen and afterCommit', () => {
    const handle = { secret: 'connection' };
    const scope = createTransactionScope(
      handle,
      () => true,
      () => undefined,
    );

    expect(Object.keys(scope).sort()).toEqual(['afterCommit', 'isOpen']);
    expect(Object.getOwnPropertySymbols(scope)).toEqual([]);
    expect(JSON.stringify(scope)).not.toContain('connection');
    expect(Object.isFrozen(scope)).toBe(true);
    expect(handleOfScope(scope)).toBe(handle);
  });

  it('follows the transaction: a closed scope has no handle, a foreign object is not a scope', () => {
    let open = true;
    const scope = createTransactionScope(
      {},
      () => open,
      () => undefined,
    );
    open = false;

    expect(scope.isOpen).toBe(false);
    expect(() => handleOfScope(scope)).toThrow(/closed/);
    expect(() => handleOfScope({ isOpen: true, afterCommit: () => undefined })).toThrow(/not created by the host/);
    expect(() => handleOfScope(undefined as never)).toThrow(/not created by the host/);
    expect(() => handleOfScope(scope)).toThrow(PluginStorageInvalid);
  });

  it('serves a read-only scope for reads and refuses writes through it', () => {
    const handle = {};
    const scope = createTransactionScope(
      handle,
      () => true,
      () => undefined,
      { readOnly: true },
    );
    expect(handleOfScope(scope)).toBe(handle);
    expect(handleOfScope(scope, 'read')).toBe(handle);
    expect(() => handleOfScope(scope, 'write')).toThrow(PluginStorageInvalid);
    expect(() => handleOfScope(scope, 'write')).toThrow(/read-only/);
    const writable = createTransactionScope(
      handle,
      () => true,
      () => undefined,
    );
    expect(handleOfScope(writable, 'write')).toBe(handle);
  });
});
