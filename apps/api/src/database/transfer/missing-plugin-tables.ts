/** A table of the SQLite data that the PostgreSQL database does not have, with its row count from the snapshot. */
export interface MissingTable {
  readonly name: string;
  readonly rows: number;
}

/** The bookkeeping tables 2.0 (`plugin_storage_migrations_<ns>`) and 1.x (`plugin_migrations_<plugin name>`) keep. */
const STORAGE_HISTORY = /^plugin_storage_migrations_(.+)$/;
const LEGACY_HISTORY = /^plugin_migrations_(.+)$/;
/** A 1.x npm package name as its history table spells it: `@attraccess/plugin-wago` -> `_attraccess_plugin_wago`. */
const NPM_PLUGIN_NAME = /^_*(?:[a-z0-9]+_)?plugin_(.+)$/;

/** The plugin namespace a history table belongs to, or undefined for any other table. */
function historyNamespace(table: string): string | undefined {
  const storage = STORAGE_HISTORY.exec(table);
  if (storage) return storage[1];
  const legacy = LEGACY_HISTORY.exec(table);
  if (!legacy) return undefined;
  const name = legacy[1].toLowerCase();
  return NPM_PLUGIN_NAME.exec(name)?.[1] ?? name.replace(/^_+/, '');
}

/**
 * The plugin a table belongs to, by the names plugins give their tables: the history tables above, and
 * `plugin_<namespace>_<table>` for data. `known` are the namespaces the history tables name; a data table belongs to
 * the longest one its name starts with, else to the part of its name up to the next underscore. Undefined: the table
 * does not follow the plugin naming.
 */
export function pluginOfTable(table: string, known: readonly string[] = []): string | undefined {
  const history = historyNamespace(table);
  if (history) return history;
  if (!table.startsWith('plugin_')) return undefined;
  const rest = table.slice('plugin_'.length);
  const owner = [...known].sort((a, b) => b.length - a.length).find((namespace) => rest.startsWith(`${namespace}_`));
  if (owner) return owner;
  const end = rest.indexOf('_');
  return end > 0 ? rest.slice(0, end) : rest || undefined;
}

export interface GroupedTables {
  /** Plugin namespace -> its tables, in the order the tables came. */
  readonly plugins: ReadonlyMap<string, readonly MissingTable[]>;
  /** Tables that follow no plugin naming. */
  readonly other: readonly MissingTable[];
}

export function groupByPlugin(tables: readonly MissingTable[]): GroupedTables {
  const known = tables.map((table) => historyNamespace(table.name)).filter((name): name is string => Boolean(name));
  const plugins = new Map<string, MissingTable[]>();
  const other: MissingTable[] = [];
  for (const table of tables) {
    const plugin = pluginOfTable(table.name, known);
    if (!plugin) other.push(table);
    else plugins.set(plugin, [...(plugins.get(plugin) ?? []), table]);
  }
  return { plugins, other };
}

const rowCount = (rows: number): string => `${rows} ${rows === 1 ? 'row' : 'rows'}`;
const listTables = (tables: readonly MissingTable[]): string =>
  tables.map((table) => `${table.name}: ${rowCount(table.rows)}`).join(', ');

/**
 * Why the import stops: the SQLite data holds rows in tables no installed (and loadable) plugin creates. Every table is
 * named with its row count, grouped by the plugin its name points to.
 */
export function describeMissingPluginData(
  tables: readonly MissingTable[],
  unloadable: readonly { name: string; reason: string }[],
): string {
  const { plugins, other } = groupByPlugin(tables);
  const parts: string[] = [];
  if (plugins.size > 0) {
    const listed = [...plugins].map(([plugin, owned]) => `plugin "${plugin}" (${listTables(owned)})`).join('; ');
    parts.push(
      plugins.size === 1
        ? `data of a plugin that is not installed or not loadable: ${listed}`
        : `data of plugins that are not installed or not loadable: ${listed}`,
    );
  }
  if (other.length > 0) parts.push(`tables not from any installed plugin: ${listTables(other)}`);
  const install =
    plugins.size === 1 && other.length === 0
      ? "Install that plugin's build for this Attraccess version in the plugin directory first"
      : 'Install the build for this Attraccess version of every plugin these tables belong to in the plugin ' +
        'directory first';
  const hint = unloadable.length
    ? `; plugins that could not be loaded: ${unloadable.map((p) => `${p.name} (${p.reason})`).join(', ')}`
    : '';
  return `the SQLite data holds ${parts.join(', and ')}. Nothing was imported. ${install}${hint}`;
}
