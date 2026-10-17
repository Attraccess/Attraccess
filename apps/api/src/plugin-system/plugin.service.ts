import { NotFoundException, BadRequestException } from '@nestjs/common';

import { spawn } from 'child_process';

import { existsSync, readdirSync, readFileSync } from 'fs';

import { rm, rename } from 'fs/promises';

import { join, basename, isAbsolute, relative, resolve } from 'path';

import { PluginMigrationService } from './plugin-migration.service';

import { randomBytes, createHash } from 'crypto';

import decompress from 'decompress';

import { FileUpload } from '../common/types/file-upload.types';

import { PluginManifestSchema, LoadedPluginManifest, PluginManifest } from './plugin.manifest';

import { type PluginManifestInfo } from '@attraccess/plugins-backend-sdk';

import { PluginBootGuard } from './runtime/boot-guard';

import { PluginSandboxService } from './plugin-sandbox.service';

import { INTERNAL_PLUGIN_DIRECTORIES } from './runtime/boot-guard';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export class PluginService extends PluginBootGuard {
  public static configure(config: { PLUGIN_DIR: string; RESTART_BY_EXIT: boolean }): void {
    getImplementationClass().removeBootGuardSignalHandlers();
    getImplementationClass().PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    getImplementationClass().RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
    getImplementationClass().plugins = null; // Discovery may have been cached with an unset path before configure() ran; force a re-scan.
    getImplementationClass().loadedPlugins.clear();
    getImplementationClass().pluginLoadErrors.clear();
    getImplementationClass().pluginFailures = new Map(
      getImplementationClass()
        .readFailures()
        .map((failure) => [failure.pluginDirectory, failure]),
    );
    getImplementationClass().logger.log(
      `PluginService configured. Path: ${getImplementationClass().PLUGIN_PATH}, RestartByExit: ${getImplementationClass().RESTART_BY_EXIT_FLAG}`,
    );
    if (!getImplementationClass().PLUGIN_PATH) {
      getImplementationClass().logger.error('PLUGIN_DIR is not configured in AppConfig! Plugin system may not work.');
    }
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.

  protected restartApp() {
    PluginService.logger.log('Restarting app');
    if (PluginService.RESTART_BY_EXIT_FLAG) {
      PluginService.logger.log('Restarting app by exiting');
      process.exit();
    }

    // restart app by starting a new process
    PluginService.logger.log('Restarting app by starting a new process');
    const subprocess = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    subprocess.unref();
    PluginService.logger.log('New process started, exiting current process');
    process.exit();
  }

  public requestRestart(): void {
    setTimeout(() => this.restartApp(), 1000);
  }

  public async deletePlugin(pluginId: string, deferRestart = false) {
    const plugin = PluginService.getPlugins().find((plugin) => plugin.id === pluginId);

    if (!plugin) {
      PluginService.logger.error(`Plugin with id ${pluginId} not found`);
      throw new NotFoundException('Plugin not found');
    }

    const pluginFolder = join(PluginService.PLUGIN_PATH, plugin.pluginDirectory);

    // if folder does not exist, throw error
    if (!existsSync(pluginFolder)) {
      PluginService.logger.error(`Plugin folder ${pluginFolder} of plugin ${plugin.name} not found`);
      throw new NotFoundException('Plugin not found');
    }

    // Revert the plugin's database migrations (drops its tables/data) BEFORE the
    // files are removed — the migration classes live in the plugin bundle and
    // must still be on disk to run. A failure here is logged but never blocks the
    // uninstall: the admin asked for the plugin to be gone.
    if (PluginMigrationService.hasMigrations(plugin)) {
      try {
        await PluginMigrationService.runDownMigrations(plugin);
      } catch (error) {
        PluginService.logger.error(
          `Failed to revert migrations for plugin ${plugin.name}; removing files anyway. Its tables may be orphaned.`,
          error as Error,
        );
      }
    }

    // delete folder
    await rm(pluginFolder, { recursive: true });
    try {
      PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    } catch (error) {
      PluginService.logger.error(`Failed to clear quarantine for deleted plugin ${plugin.name}`, error as Error);
    }

    // restart app
    if (!deferRestart) this.requestRestart();
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.

  public async uploadPlugin(zipFile: FileUpload, deferRestart = false) {
    // check if file is a zip file
    if (zipFile.mimetype !== 'application/zip') {
      PluginService.logger.error(`File ${zipFile.originalname} is not a zip file`);
      throw new BadRequestException('File must be a zip file');
    }

    // unzip file
    PluginService.logger.debug(`Unzipping file ${zipFile.originalname}`);
    const tempFolder = join(PluginService.PLUGIN_PATH, 'temp', randomBytes(16).toString('base64url').slice(0, 21));

    try {
      let extracted: unknown[] = [];
      try {
        extracted = await decompress(zipFile.buffer, tempFolder);
      } catch (error) {
        PluginService.logger.error(`Failed to extract ${zipFile.originalname}`, error as Error);
      }

      // a non-zip buffer decompresses to nothing instead of throwing
      if (extracted.length === 0) {
        throw new BadRequestException('File could not be extracted, it must be a valid zip file');
      }

      // read manifest, tolerating the single wrapper folder that Finder and most GUI zip tools add
      const sourceFolder = PluginService.findManifestFolder(tempFolder);
      PluginService.logger.debug(`Reading manifest from ${sourceFolder}`);
      const manifestContent = JSON.parse(readFileSync(join(sourceFolder, 'plugin.json'), 'utf8'));

      // validate manifest
      PluginService.logger.debug(`Validating manifest`, manifestContent);
      const manifest = PluginManifestSchema.parse(manifestContent);

      const pluginName = PluginService.safePluginName(manifest.name);
      await PluginService.withPluginUploadLock(pluginName, async () => {
        const pluginFolder = join(PluginService.PLUGIN_PATH, pluginName);
        const backupFolder = join(PluginService.PLUGIN_PATH, `.${pluginName}-${randomBytes(8).toString('hex')}`);
        const replacing = existsSync(pluginFolder);

        // A zip upload is the update mechanism for uploaded plugins. Keep the
        // old archive on disk until the new one has been placed successfully.
        if (replacing) {
          PluginService.logger.log(`Replacing uploaded plugin ${pluginName}`);
          await rename(pluginFolder, backupFolder);
        }

        try {
          PluginService.logger.debug(`Moving plugin to plugins folder ${pluginFolder}`);
          await rename(sourceFolder, pluginFolder);
        } catch (error) {
          if (replacing) await rename(backupFolder, pluginFolder);
          throw error;
        }

        // The replacement is complete once the new directory is in place.
        // A stale backup must not prevent activating the uploaded plugin.
        if (!deferRestart) this.requestRestart();

        if (replacing) {
          try {
            await rm(backupFolder, { recursive: true, force: true });
          } catch (error) {
            PluginService.logger.error(`Failed to remove plugin backup ${backupFolder}`, error as Error);
          }
        }

        try {
          PluginService.clearPluginQuarantine(pluginName);
        } catch (error) {
          PluginService.logger.error(`Failed to clear quarantine for uploaded plugin ${pluginName}`, error as Error);
        }
      });

      // return manifest
      PluginService.logger.debug(`Returning manifest ${manifest}`);
      return manifest;
    } finally {
      await rm(tempFolder, { recursive: true, force: true });
    }
  }

  protected static safePluginName(name: string): string {
    const safeName = basename(name);
    const root = resolve(getImplementationClass().PLUGIN_PATH);
    const target = resolve(root, safeName);
    const targetRelativeToRoot = relative(root, target);
    if (
      !safeName ||
      safeName.startsWith('.') ||
      safeName !== name ||
      name.includes('\\') ||
      targetRelativeToRoot.startsWith('..') ||
      isAbsolute(targetRelativeToRoot) ||
      // The `npm-<base64url>` namespace is reserved for npm-managed installs
      // (see pluginDirectory() in npm-plugin.service.ts); a ZIP upload landing
      // in it would be silently dropped by findPluginsInFolder's discovery filter.
      /^npm-[A-Za-z0-9_-]+$/.test(safeName)
    )
      throw new BadRequestException('Plugin name must be a visible single path segment');
    return safeName;
  }

  protected static async withPluginUploadLock<T>(pluginName: string, action: () => Promise<T>): Promise<T> {
    const previous = getImplementationClass().pluginUploadLocks.get(pluginName) ?? Promise.resolve();
    let release!: () => void;
    const current = previous.then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    getImplementationClass().pluginUploadLocks.set(pluginName, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (getImplementationClass().pluginUploadLocks.get(pluginName) === current)
        getImplementationClass().pluginUploadLocks.delete(pluginName);
    }
  }

  protected static findManifestFolder(tempFolder: string): string {
    if (existsSync(join(tempFolder, 'plugin.json'))) {
      return tempFolder;
    }

    // ponytail: only one level deep - nobody nests a plugin twice
    const candidates = readdirSync(tempFolder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '__MACOSX' && !entry.name.startsWith('.'))
      .map((entry) => join(tempFolder, entry.name))
      .filter((dir) => existsSync(join(dir, 'plugin.json')));

    if (candidates.length !== 1) {
      throw new BadRequestException('Zip file must contain a plugin.json, either at its root or in a single folder');
    }

    return candidates[0];
  }

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
