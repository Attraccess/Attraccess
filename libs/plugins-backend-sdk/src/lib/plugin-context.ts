import { DynamicModule, LoggerService, Type } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

/**
 * DI token under which a plugin's own services can inject the PluginContext.
 * The host publishes the context as a module-scoped provider with this token.
 */
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/**
 * Subset of the host manifest exposed to a plugin at runtime. The host's
 * LoadedPluginManifest structurally satisfies this shape.
 */
export interface PluginManifestInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly pluginDirectory: string;
}

/**
 * Curated facade handed to a backend plugin at load time. It is the single,
 * versioned seam between plugin code and the host application. Adding a field is
 * a minor SDK bump; removing/changing one is a major bump.
 */
export interface PluginContext {
  /** This plugin's own manifest (name, version, directory, id). */
  readonly manifest: PluginManifestInfo;

  /** Shared application event bus — the same EventEmitter2 instance the host uses. */
  readonly events: EventEmitter2;

  /** Shared TypeORM connection. Plugins must never re-initialise TypeOrmModule. */
  readonly dataSource: DataSource;

  /** Scoped logger, prefixed with the plugin name. */
  readonly logger: LoggerService;

  /** Typed repository accessor over the shared DataSource. */
  getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T>;

  /**
   * Escape hatch to resolve an arbitrary host provider by token. Privileged:
   * this is where a future capability/permission gate is enforced.
   */
  get<T>(token: Type<T> | string | symbol): T;
}

/**
 * Shape every backend plugin's default export must satisfy. The host calls
 * register(context) at load time to obtain the plugin's Nest module definition.
 */
export interface PluginBackendModule {
  register(context: PluginContext): DynamicModule;
}
