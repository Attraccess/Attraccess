/**
 * Backend-neutral persistence surface of the plugin SDK.
 *
 * The SDK root knows no database engine: it names the active engine, offers an atomic unit of work with a post-commit
 * hook, and lets a plugin declare which engines its own storage code supports. Everything that is specific to one
 * engine (entity decorators, repositories, SQL migrations) lives behind that engine's subpath, for example
 * `@attraccess/plugins-backend-sdk/sqlite`. See `docs/en/plugins/database-migrations.md`.
 */

/** Database engines the host can run and a plugin can declare support for. Mirrors `persistence.backends` in plugin.json. */
export const PLUGIN_PERSISTENCE_BACKENDS = ['sqlite'] as const;
export type PluginPersistenceBackend = (typeof PLUGIN_PERSISTENCE_BACKENDS)[number];

export function isPluginPersistenceBackend(value: unknown): value is PluginPersistenceBackend {
  return typeof value === 'string' && (PLUGIN_PERSISTENCE_BACKENDS as readonly string[]).includes(value);
}

/** The atomic unit of work of one {@link PluginPersistenceContext.transaction} call. */
export interface PluginTransactionScope {
  /** True from the start of the transaction until it committed or rolled back. */
  readonly isOpen: boolean;
  /**
   * Registers work that runs only after the transaction committed (notifications, MQTT publishes, device commands).
   * It never runs on rollback. A failing callback is logged; it neither undoes the commit nor stops later callbacks.
   */
  afterCommit(callback: () => void | Promise<void>): void;
}

/** Thrown when plugin code needs an engine the host does not run, or uses a scope of another engine. */
export class PluginPersistenceBackendError extends Error {
  constructor(
    readonly required: string,
    readonly active: string,
    detail?: string,
  ) {
    super(
      detail ??
        `This plugin code needs the ${required} database engine, but the host runs ${active}. ` +
          `Declare the engines the plugin supports in persistence.backends of plugin.json.`,
    );
    this.name = 'PluginPersistenceBackendError';
  }
}

/**
 * Key under which the host hands the engine-specific connection to an engine subpath such as
 * `@attraccess/plugins-backend-sdk/sqlite`. It is an implementation seam, not an API for plugin code: use the engine
 * subpath helper (`sqlitePersistence(context)`) instead.
 */
export const PLUGIN_ENGINE_ACCESS = Symbol.for('attraccess.plugin.persistence.engineAccess');

/** Opaque engine connection behind {@link PluginPersistenceContext}. Only an engine subpath interprets it. */
export interface PluginEngineAccess {
  readonly backend: PluginPersistenceBackend;
  /** The engine's shared host connection. Resolves lazily: it throws before the host finished bootstrapping. */
  connection(): unknown;
  /** The engine handle (for example a transaction manager) behind a transaction scope of this host. */
  handleOf(scope: PluginTransactionScope): unknown;
}

/**
 * Host persistence capabilities of a plugin. Requires the DATABASE_ACCESS permission.
 *
 * The context never exposes a connection, repository or query API. A plugin that stores data states its engine
 * support in `persistence.backends` of plugin.json and in {@link PluginBackendModule.persistence}.
 */
export interface PluginPersistenceContext {
  /** The engine the host runs. Plugin code that needs engine specifics checks it or uses the engine subpath. */
  readonly backend: PluginPersistenceBackend;

  /**
   * Whether the host runs the given engine. Use it to choose between engine-specific code paths; the engine
   * subpath helpers fail with a {@link PluginPersistenceBackendError} on their own when the engine does not match.
   */
  supports(backend: PluginPersistenceBackend): boolean;

  /**
   * Runs `work` in one atomic, isolated transaction: it commits when `work` resolves and rolls back when it throws.
   * Concurrent transactions (core writes included) never see each other's uncommitted writes, and a check-then-write
   * sequence inside one transaction (an overlap check, then the insert) cannot be raced by another transaction: the
   * engine either orders the transactions or fails one of them with an error, which rolls it back. How an engine
   * achieves this (for example SQLite runs transactions one at a time) is described by its engine subpath.
   *
   * Keep `work` short and limited to database work: no HTTP, MQTT, email or other I/O inside. Register such effects
   * with `scope.afterCommit`; they run only after the commit. Do not nest calls: the host rejects a transaction
   * started inside `work` with an error; pass the scope down instead. Do not await core services that write (session
   * start and end) inside `work` either.
   */
  transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T>;

  /** Implementation seam for engine subpaths; see {@link PLUGIN_ENGINE_ACCESS}. */
  readonly [PLUGIN_ENGINE_ACCESS]: PluginEngineAccess;
}

/**
 * Constructor of a storage entity class of the declared engine. The class itself is defined with the engine
 * subpath's decorators, so the host registers its metadata without the SDK root knowing the engine.
 */
export type PluginEntityClass = new (...args: never[]) => object;

/** Storage a plugin ships for the SQLite engine. */
export interface PluginSqlitePersistence {
  /**
   * Entity classes the host registers into its shared connection at load time so `sqlitePersistence(context)
   * .getRepository(Entity)` resolves them. The schema stays owned by the plugin's migrations (the host runs with
   * `synchronize: false`), so an entity describes an existing table.
   */
  entities?: PluginEntityClass[];
}

/**
 * Engine capability declaration of a plugin backend module. A plugin lists the engines it provides storage code
 * for. The host refuses to load a plugin whose declaration does not include the active engine, before any
 * migration or registration ran.
 */
export interface PluginPersistenceDeclaration {
  sqlite?: PluginSqlitePersistence;
}

/** Engines named in a plugin's declaration. */
export function declaredPersistenceBackends(declaration: PluginPersistenceDeclaration | undefined): string[] {
  return Object.entries(declaration ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([backend]) => backend);
}

/**
 * Constructor of a migration class a plugin ships (a class with `up` and `down` of its engine). The engine subpath
 * types the methods; the host only needs to construct it. A plugin's migrations entry exports these as named
 * exports or as a default-exported array.
 */
export type PluginMigrationClass = new () => object;
