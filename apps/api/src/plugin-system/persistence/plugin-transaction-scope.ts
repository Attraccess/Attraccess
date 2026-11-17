import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';

/**
 * The transaction scopes the host hands to plugins. A scope is an opaque object to the plugin: the engine's handle
 * (a transaction, a connection) is kept in a table only the host can read, never as a property, so a plugin cannot
 * reach it by inspecting the scope. The record port and the host data ports resolve the handle with
 * {@link handleOfScope}.
 */
const handles = new WeakMap<object, { readonly handle: unknown; readonly isOpen: () => boolean }>();

/**
 * Creates a scope around an engine handle. `isOpen` tells whether the transaction still runs; `afterCommit` is the
 * scope's own registration of post-commit work (a host-owned transaction rejects it).
 */
export function createTransactionScope(
  handle: unknown,
  isOpen: () => boolean,
  afterCommit: (callback: () => void | Promise<void>) => void,
): PluginTransactionScope {
  const scope: PluginTransactionScope = Object.freeze({
    get isOpen(): boolean {
      return isOpen();
    },
    afterCommit,
  });
  handles.set(scope, { handle, isOpen });
  return scope;
}

/** The engine handle behind an open scope. Throws for a closed scope or one the host did not create. */
export function handleOfScope<T>(scope: PluginTransactionScope): T {
  const entry = typeof scope === 'object' && scope !== null ? handles.get(scope) : undefined;
  if (!entry) throw new Error('The transaction scope was not created by the host.');
  if (!entry.isOpen()) throw new Error('The transaction scope is closed.');
  return entry.handle as T;
}
