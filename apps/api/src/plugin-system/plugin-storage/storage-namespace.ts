/**
 * Storage namespaces of plugins. A plugin's tables live under `plugin_<namespace>_` (derived names) or, for tables
 * adopted from 1.x, under `<namespace>_`. Namespaces are plain name prefixes, so one can contain another: the
 * namespace `demo` (prefix `plugin_demo_`) contains every name of `demo_extra` (prefix `plugin_demo_extra_`).
 *
 * A name belongs to the plugin whose namespace prefix matches it longest. A plugin may use a name only when no other
 * plugin's prefix matches it at least as long as its own: `demo` may not use `plugin_demo_extra_x` while `demo-extra`
 * is installed, and `demo-extra` may not be installed while `demo` keeps `plugin_demo_extra_x`.
 */

/** The prefixes of a namespace: the derived form and the short form of tables adopted from 1.x. */
export const namespacePrefixes = (namespace: string): readonly string[] => [`plugin_${namespace}_`, `${namespace}_`];

/** The length of the longest prefix of `namespace` that `name` starts with (case-insensitive); 0 when none does. */
export function namespaceMatch(name: string, namespace: string): number {
  const lowered = name.toLowerCase();
  return Math.max(0, ...namespacePrefixes(namespace).map((prefix) => (lowered.startsWith(prefix) ? prefix.length : 0)));
}

/**
 * The namespace among `others` that `name` of the plugin with namespace `own` lies in, or undefined. A name lies in
 * another namespace when one of that namespace's prefixes matches it at least as long as the own namespace does.
 */
export function foreignNamespaceOf(name: string, own: string, others: Iterable<string>): string | undefined {
  const ownMatch = namespaceMatch(name, own);
  for (const other of others) {
    if (other === own) continue;
    const match = namespaceMatch(name, other);
    if (match > 0 && match >= ownMatch) return other;
  }
  return undefined;
}

const INDEX_PREFIX = /^(?:idx|uq)_/i;

/**
 * The part of an index name that must lie in the plugin's namespace: the name without its `idx_`/`uq_` marker
 * (generated names are `idx_<table>_<fields>`; 1.x names look like `UQ_plugin_wago_controllers_hardware_id`).
 */
export const indexNameBody = (name: string): string => name.replace(INDEX_PREFIX, '');
