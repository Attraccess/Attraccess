import type { PluginService } from './plugin.service';
import type { PluginManifestInfo } from '@attraccess/plugins-backend-sdk';
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PluginBootGuardImplementation } from './plugin-boot-guard';
import { PluginSandboxService } from './plugin-sandbox.service';
import { LoadedPluginManifest, PluginManifest } from './plugin.manifest';
import { INTERNAL_PLUGIN_DIRECTORIES } from './plugin.service.route-context';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export abstract class PluginManifestLoadingImplementation extends PluginBootGuardImplementation {
  public static getPlugins(): LoadedPluginManifest[] {
    if (!getImplementationClass().plugins) {
      getImplementationClass().plugins = getImplementationClass().findPluginsInFolder(
        getImplementationClass().PLUGIN_PATH,
      );
      getImplementationClass().logger.log(
        `Found ${getImplementationClass().plugins.length} plugins in ${getImplementationClass().PLUGIN_PATH}`,
      );
    }

    return getImplementationClass().plugins;
  }

  public static getManifestById(id: string): LoadedPluginManifest | undefined {
    return getImplementationClass()
      .getPlugins()
      .find((plugin) => plugin.id === id);
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.
  public static getPluginsWithLoadStatus(): LoadedPluginManifest[] {
    return getImplementationClass()
      .getPlugins()
      .map((manifest) => {
        const key = `${manifest.name}@${manifest.version}`;
        const error = getImplementationClass().pluginLoadErrors.get(key);

        let status: LoadedPluginManifest['status'] = 'unknown';
        if (error) {
          status = 'error';
        } else if (getImplementationClass().loadedPlugins.has(key)) {
          status = 'loaded';
        }

        return { ...manifest, status, error: error ? error.message : null };
      });
  }

  public static toManifestInfo(manifest: LoadedPluginManifest): PluginManifestInfo {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      pluginDirectory: manifest.pluginDirectory,
    };
  }

  public static markPluginAsLoaded(pluginName: string): void {
    getImplementationClass().logger.log(`Marking plugin ${pluginName} as loaded`);
    getImplementationClass().loadedPlugins.add(pluginName);
  }

  public static setPluginLoadError(pluginName: string, error: Error): void {
    getImplementationClass().logger.error(`Error loading plugin ${pluginName}: ${error.message}`);
    getImplementationClass().pluginLoadErrors.set(pluginName, error);
  }

  public static isPluginQuarantined(manifest: Pick<LoadedPluginManifest, 'pluginDirectory'>): boolean {
    return getImplementationClass().pluginFailures.has(manifest.pluginDirectory);
  }

  protected static findPluginsInFolder(rootFolder: string): LoadedPluginManifest[] {
    // if folder does not exist, return empty array
    if (!existsSync(rootFolder)) {
      return [];
    }

    const potentialPluginFolders = readdirSync(rootFolder);
    // npm packages are active only while their installation is tracked. A failed or
    // interrupted removal may leave files behind; loading them alongside an uploaded
    // copy of the same plugin would register its flow nodes and audit domains twice.
    // A missing state file means "no npm plugins installed" (filter normally); an
    // existing-but-unreadable one (EACCES, EIO, a bad restore) must not be treated
    // the same way, or every npm-installed plugin silently disappears from
    // discovery with no signal beyond "Found N folders in ...".
    const npmStatePath = join(getImplementationClass().PLUGIN_PATH, '.npm-plugin-state.json');
    let npmInstalls: Set<string> | null = new Set();
    if (existsSync(npmStatePath)) {
      try {
        const records = JSON.parse(readFileSync(npmStatePath, 'utf8')) as unknown;
        npmInstalls = new Set(
          (Array.isArray(records) ? records : [])
            .map((record: { installPath?: unknown }) => record?.installPath)
            .filter((path): path is string => typeof path === 'string'),
        );
      } catch (error) {
        getImplementationClass().logger.error(
          `Failed to read ${npmStatePath}; not filtering npm-managed plugin folders until it recovers`,
          error as Error,
        );
        npmInstalls = null;
      }
    }

    getImplementationClass().logger.log(`Found ${potentialPluginFolders.length} folders in ${rootFolder}`);

    return potentialPluginFolders
      .filter(
        (pluginFolder) =>
          !pluginFolder.startsWith('.') &&
          !INTERNAL_PLUGIN_DIRECTORIES.has(pluginFolder) &&
          (npmInstalls === null || !/^npm-[A-Za-z0-9_-]+$/.test(pluginFolder) || npmInstalls.has(pluginFolder)),
      )
      .map((pluginFolder) => {
        const manifest = getImplementationClass().findPluginManifestInPluginFolder(
          rootFolder,
          pluginFolder,
        ) as LoadedPluginManifest | null;
        if (!manifest) {
          return null;
        }

        manifest.pluginDirectory = pluginFolder;
        // The directory is the installation identity. Keeping its derived ID stable
        // prevents registrations from changing every time the host restarts.
        manifest.id = createHash('sha256').update(pluginFolder).digest('base64url').slice(0, 21);

        const failure = getImplementationClass().pluginFailures.get(pluginFolder);
        if (failure) {
          getImplementationClass().setPluginLoadError(
            `${manifest.name}@${manifest.version}`,
            new Error(failure.message),
          );
        }

        try {
          manifest.permissions = PluginSandboxService.validateDeclaredPermissions(manifest.name, manifest.permissions);
        } catch (error) {
          getImplementationClass().setPluginLoadError(`${manifest.name}@${manifest.version}`, error as Error);
          return null;
        }

        return manifest;
      })
      .filter((manifest) => manifest !== null);
  }

  protected static findPluginManifestInPluginFolder(rootFolder: string, pluginFolder: string): PluginManifest | null {
    const manifestPath = join(rootFolder, pluginFolder, 'plugin.json');

    if (!existsSync(manifestPath)) {
      getImplementationClass().logger.log(`No manifest found at ${manifestPath}`);
      return null;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    if (manifest.main.backend?.directory) {
      manifest.main.backend.directory = join(pluginFolder, manifest.main.backend.directory);
    }

    if (manifest.main.frontend?.directory) {
      manifest.main.frontend.directory = join(pluginFolder, manifest.main.frontend.directory);
    }

    if (manifest.main.migrations?.directory) {
      manifest.main.migrations.directory = join(pluginFolder, manifest.main.migrations.directory);
    }

    return manifest;
  }
}
