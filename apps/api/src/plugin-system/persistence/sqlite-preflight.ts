import type { PluginBackendAdapters, SqlitePluginRegistration } from '@attraccess/plugins-backend-sdk/adapter';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk/v2';
import { assertPluginBackendSupport, PluginBackendRequirement } from './port';
import { SqlitePluginAdapters } from './plugin-adapters';

/** Validate the same declaration and registry before activation or any migration activity. */
export function preflightPluginBackend(
  manifest: PluginBackendRequirement,
  plugin: PluginBackendModule & Partial<PluginBackendAdapters>,
  backend: string,
): SqlitePluginRegistration | undefined {
  assertPluginBackendSupport(manifest, backend);
  assertPluginBackendSupport({ name: manifest.name, persistence: plugin?.persistence }, backend);
  if (
    !plugin?.persistence ||
    typeof plugin.register !== 'function' ||
    JSON.stringify([...plugin.persistence.supportedBackends].sort()) !==
      JSON.stringify([...(manifest.persistence?.supportedBackends ?? [])].sort())
  ) {
    throw new Error(`Plugin "${manifest.name}" exports a persistence contract inconsistent with its manifest.`);
  }
  const registrations = (plugin.persistenceAdapters ?? []).filter((registration) => registration.backend === backend);
  if (registrations.length > 1) throw new Error(`Plugin "${manifest.name}" has duplicate SQLite registrations.`);
  const registration = registrations[0];
  if ((registration?.migrations ?? []).some((value) => typeof value !== 'function'))
    throw new Error('Plugin migration registrations must contain classes.');
  if ((registration?.entities ?? []).some((value) => typeof value !== 'function'))
    throw new Error('Plugin entity registrations must contain classes.');
  // Registry construction validates operation tokens without opening or resolving a connection.
  new SqlitePluginAdapters(registration, () => {
    throw new Error('Preflight cannot access the database');
  });
  return registration;
}
