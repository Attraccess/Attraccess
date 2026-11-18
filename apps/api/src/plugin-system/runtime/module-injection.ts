import type { DynamicModule, Provider, Type } from '@nestjs/common';
import { databaseAccessRefusal, isDatabaseToken } from './database-tokens';
import { PLUGIN_MIGRATION_GUIDE_URL } from './plugin-compatibility';

/**
 * A plugin's Nest module may not inject the host's database: the TypeORM connection, an entity manager, a repository,
 * the unit of work and the persistence adapters behind it, or ModuleRef (see database-tokens). The host does not hand the plugin a connection through its context either; this closes the remaining
 * route, the global TypeORM providers every module can see. Checked on the module a plugin returns from `register`,
 * before it joins the application, so a violating plugin does not load.
 */

const MAX_DEPTH = 6;
const TYPEORM_MODULES = new Set(['TypeOrmModule', 'TypeOrmCoreModule']);

interface DependencyMetadata {
  index?: number;
  key?: string | symbol;
  param?: unknown;
  type?: unknown;
}

const metadata = (key: string, target: object): unknown =>
  (Reflect as unknown as { getMetadata(key: string, target: object): unknown }).getMetadata(key, target);

/** The injection tokens a class asks for: constructor parameters and decorated properties. */
function classTokens(target: unknown): unknown[] {
  if (typeof target !== 'function') return [];
  const tokens: unknown[] = [...((metadata('design:paramtypes', target) as unknown[] | undefined) ?? [])];
  for (const dependency of (metadata('self:paramtypes', target) as DependencyMetadata[] | undefined) ?? []) {
    if (typeof dependency.index === 'number') tokens[dependency.index] = dependency.param;
  }
  for (const property of (metadata('self:properties_metadata', target) as DependencyMetadata[] | undefined) ?? []) {
    tokens.push(property.type);
  }
  return tokens;
}

function providerTokens(provider: Provider): unknown[] {
  if (typeof provider === 'function') return classTokens(provider);
  const custom = provider as {
    useClass?: unknown;
    useExisting?: unknown;
    inject?: unknown[];
  };
  const injected = (custom.inject ?? []).map((entry) =>
    typeof entry === 'object' && entry !== null && 'token' in entry ? (entry as { token: unknown }).token : entry,
  );
  return [...injected, custom.useExisting, ...classTokens(custom.useClass)];
}

function check(pluginName: string, module: DynamicModule | Type<unknown>, depth: number): void {
  if (depth > MAX_DEPTH) return;
  const moduleName = typeof module === 'function' ? module.name : module.module?.name;
  if (moduleName && TYPEORM_MODULES.has(moduleName)) {
    throw new Error(
      `Plugin "${pluginName}" imports ${moduleName}: plugins have no database access. ` +
        `Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
    );
  }
  if (typeof module === 'function') return;
  for (const provider of module.providers ?? []) {
    const offender = providerTokens(provider).find(isDatabaseToken);
    if (offender !== undefined) fail(pluginName, offender);
  }
  for (const controller of module.controllers ?? []) {
    const offender = classTokens(controller).find(isDatabaseToken);
    if (offender !== undefined) fail(pluginName, offender);
  }
  for (const imported of module.imports ?? []) {
    if (imported && (typeof imported === 'function' || typeof imported === 'object')) {
      check(pluginName, imported as DynamicModule | Type<unknown>, depth + 1);
    }
  }
}

function fail(pluginName: string, token: unknown): never {
  throw databaseAccessRefusal(pluginName, 'injects', token);
}

/** Throws when the plugin's module asks for a database handle. */
export function assertModuleHasNoDatabaseInjection(pluginName: string, module: DynamicModule): void {
  check(pluginName, module, 0);
}
