import {
  definePluginStorage,
  f,
  step,
  table,
  type PluginContext,
  type PluginStorageRow,
  type PluginStorageTablesApi,
} from '@attraccess/plugins-backend-sdk';

export const wallTable = table(
  {
    id: f.id(),
    name: f.string(),
    /**
     * The secret of the wall's public link. Stored in plain text on purpose: a wall shows nothing personal (machine
     * names, pictures and states only), and managers must be able to copy the link again for another screen.
     * Regenerating it is the way to revoke a link.
     */
    token: f.string(),
    /** Which resources the wall shows, see {@link WallSelection}. */
    selection: f.json(),
    createdAt: f.timestamp(),
    updatedAt: f.timestamp(),
  },
  { indexes: [{ fields: ['token'], unique: true }] },
);

export type WallRow = PluginStorageRow<typeof wallTable>;

const tables = { walls: wallTable };

export const statusWallStorage = definePluginStorage({
  tables,
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: Object.entries(tables).map(([name, definition]) => step.createTable(name, definition)),
    },
  ],
});

export type StatusWallTables = PluginStorageTablesApi<typeof statusWallStorage.tables>;

const opened = new WeakMap<PluginContext, StatusWallTables>();

/** The plugin's tables, opened on first use (providers are built before the host serves the storage). */
export function tablesOf(context: PluginContext): StatusWallTables {
  let tables = opened.get(context);
  if (!tables) {
    tables = context.storage.open(statusWallStorage);
    opened.set(context, tables);
  }
  return tables;
}
