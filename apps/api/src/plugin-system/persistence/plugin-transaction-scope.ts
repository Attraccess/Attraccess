import { PluginStorageInvalid, type PluginTransactionScope } from '@attraccess/plugins-backend-sdk';

/**
 * The transaction scopes the host hands to plugins. A scope is an opaque object to the plugin: the engine's handle
 * (a transaction, a connection) is kept in a table only the host can read, never as a property, so a plugin cannot
 * reach it by inspecting the scope. The record port and the host data ports resolve the handle with
 * {@link handleOfScope}.
 */
interface ScopeEntry {
  readonly handle: unknown;
  readonly isOpen: () => boolean;
  readonly readOnly: boolean;
}

const handles = new WeakMap<object, ScopeEntry>();

/**
 * Creates a scope around an engine handle. `isOpen` tells whether the transaction still runs; `afterCommit` is the
 * scope's own registration of post-commit work (a host-owned transaction rejects it). A `readOnly` scope (the one a
 * hook gets for the host's own transaction) lets plugin storage read through it and refuses writes.
 */
export function createTransactionScope(
  handle: unknown,
  isOpen: () => boolean,
  afterCommit: (callback: () => void | Promise<void>) => void,
  options: { readOnly?: boolean } = {},
): PluginTransactionScope {
  const scope: PluginTransactionScope = Object.freeze({
    get isOpen(): boolean {
      return isOpen();
    },
    afterCommit,
  });
  handles.set(scope, { handle, isOpen, readOnly: options.readOnly === true });
  return scope;
}

/**
 * The engine handle behind an open scope, for a read or a write through it. Throws PluginStorageInvalid for a closed
 * scope, one the host did not create, and a write through a read-only scope.
 */
export function handleOfScope<T>(scope: PluginTransactionScope, access: 'read' | 'write' = 'read'): T {
  const entry = typeof scope === 'object' && scope !== null ? handles.get(scope) : undefined;
  if (!entry) throw new PluginStorageInvalid('The transaction scope was not created by the host.');
  if (!entry.isOpen()) throw new PluginStorageInvalid('The transaction scope is closed.');
  if (access === 'write' && entry.readOnly) {
    throw new PluginStorageInvalid(
      "The host's transaction is read-only for plugins: a hook reads through its scope and writes nothing.",
    );
  }
  return entry.handle as T;
}
