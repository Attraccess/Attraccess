import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import type { PluginManifestInfo } from '@attraccess/plugins-backend-sdk';
import { PluginManifest, PluginManifestSchema, LoadedPluginManifest } from './plugin.manifest';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginMigrationService } from './plugin-migration.service';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { FileUpload } from '../common/types/file-upload.types';
import { rename, rm } from 'fs/promises';
import decompress from 'decompress';
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';

const INTERNAL_PLUGIN_DIRECTORIES = new Set(['.npm-backups', '.plugin-failures.json', '.plugin-boot-guard.json']);
const PLUGIN_FAILURES_FILE = '.plugin-failures.json';
const PLUGIN_BOOT_GUARD_FILE = '.plugin-boot-guard.json';

type PluginFailure = { pluginDirectory: string; message: string };


export class PluginService {
  private static plugins: LoadedPluginManifest[] | null = null;
  private static loadedPlugins: Set<string> = new Set();
  private static pluginLoadErrors: Map<string, Error> = new Map();
  private static pluginFailures: Map<string, PluginFailure> = new Map();
  private static logger = new Logger(PluginService.name);
  public static PLUGIN_PATH: string;
  private static RESTART_BY_EXIT_FLAG: boolean;

  public static configure(config: { PLUGIN_DIR: string, RESTART_BY_EXIT: boolean }): void {
    PluginService.PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    PluginService.RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
    PluginService.plugins = null; // Discovery may have been cached with an unset path before configure() ran; force a re-scan.
    PluginService.loadedPlugins.clear();
    PluginService.pluginLoadErrors.clear();
    PluginService.pluginFailures = new Map(
      PluginService.readFailures().map((failure) => [failure.pluginDirectory, failure]),
    );
    PluginService.logger.log(`PluginService configured. Path: ${PluginService.PLUGIN_PATH}, RestartByExit: ${PluginService.RESTART_BY_EXIT_FLAG}`);
    if (!PluginService.PLUGIN_PATH) {
        PluginService.logger.error('PLUGIN_DIR is not configured in AppConfig! Plugin system may not work.');
    }
  }


  public static getPlugins(): LoadedPluginManifest[] {
    if (!PluginService.plugins) {
      PluginService.plugins = PluginService.findPluginsInFolder(PluginService.PLUGIN_PATH);
      PluginService.logger.log(`Found ${PluginService.plugins.length} plugins in ${PluginService.PLUGIN_PATH}`);
    }

    return PluginService.plugins;
  }

  public static getManifestById(id: string): LoadedPluginManifest | undefined {
    return PluginService.getPlugins().find((plugin) => plugin.id === id);
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.
  public static getPluginsWithLoadStatus(): LoadedPluginManifest[] {
    return PluginService.getPlugins().map((manifest) => {
      const key = `${manifest.name}@${manifest.version}`;
      const error = PluginService.pluginLoadErrors.get(key);

      let status: LoadedPluginManifest['status'] = 'unknown';
      if (error) {
        status = 'error';
      } else if (PluginService.loadedPlugins.has(key)) {
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
    PluginService.logger.log(`Marking plugin ${pluginName} as loaded`);
    PluginService.loadedPlugins.add(pluginName);
  }

  public static setPluginLoadError(pluginName: string, error: Error): void {
    PluginService.logger.error(`Error loading plugin ${pluginName}: ${error.message}`);
    PluginService.pluginLoadErrors.set(pluginName, error);
  }

  /**
   * Persist a failed plugin outside its package. A subsequent process must never
   * retry code which already prevented the host from starting.
   */
  public static quarantinePlugin(manifest: LoadedPluginManifest, error: Error): void {
    const key = `${manifest.name}@${manifest.version}`;
    PluginService.setPluginLoadError(key, error);
    try {
      PluginService.quarantinePluginDirectory(manifest.pluginDirectory, error);
    } catch (persistenceError) {
      PluginService.logger.error(`Failed to persist quarantine for ${key}`, persistenceError as Error);
    }
  }

  public static quarantinePluginDirectory(pluginDirectory: string, error: Error): void {
    PluginService.pluginFailures.set(pluginDirectory, { pluginDirectory, message: error.message });
    PluginService.writeFailures([...PluginService.pluginFailures.values()]);
  }

  public static isPluginQuarantined(manifest: Pick<LoadedPluginManifest, 'pluginDirectory'>): boolean {
    return PluginService.pluginFailures.has(manifest.pluginDirectory);
  }

  /** Marks active plugins only while Nest is running their lifecycle hooks. */
  public static beginBootGuard(): void {
    const previous = PluginService.readBootGuard();
    if (previous.length > 0) {
      for (const pluginDirectory of previous) {
        if (!PluginService.pluginFailures.has(pluginDirectory)) {
          PluginService.pluginFailures.set(pluginDirectory, {
            pluginDirectory,
            message: 'Plugin was automatically disabled because the previous application startup did not complete. Review the plugin and reinstall or remove it before enabling it again.',
          });
        }
      }
      PluginService.writeFailures([...PluginService.pluginFailures.values()]);
      PluginService.logger.error(`Disabled ${previous.length} plugin(s) after an incomplete previous startup.`);
    }

    const active = PluginService.getPlugins()
      .filter((manifest) => !PluginService.pluginFailures.has(manifest.pluginDirectory))
      .map((manifest) => manifest.pluginDirectory);
    PluginService.writeBootGuard(active);
  }

  public static clearBootGuard(): void {
    const path = join(PluginService.PLUGIN_PATH, PLUGIN_BOOT_GUARD_FILE);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  public static clearPluginQuarantine(pluginDirectory: string): void {
    const failure = PluginService.pluginFailures.get(pluginDirectory);
    if (!failure) return;

    PluginService.pluginFailures.delete(pluginDirectory);
    try {
      PluginService.writeFailures([...PluginService.pluginFailures.values()]);
    } catch (error) {
      PluginService.pluginFailures.set(pluginDirectory, failure);
      throw error;
    }
  }

  private static findPluginsInFolder(rootFolder: string): LoadedPluginManifest[] {
    // if folder does not exist, return empty array
    if (!existsSync(rootFolder)) {
      return [];
    }

    const potentialPluginFolders = readdirSync(rootFolder);

    PluginService.logger.log(`Found ${potentialPluginFolders.length} folders in ${rootFolder}`);

    return potentialPluginFolders
      .filter((pluginFolder) => !INTERNAL_PLUGIN_DIRECTORIES.has(pluginFolder))
      .map((pluginFolder) => {
        const manifest = PluginService.findPluginManifestInPluginFolder(
          rootFolder,
          pluginFolder
        ) as LoadedPluginManifest | null;
        if (!manifest) {
          return null;
        }

        manifest.pluginDirectory = pluginFolder;
        // The directory is the installation identity. Keeping its derived ID stable
        // prevents registrations from changing every time the host restarts.
        manifest.id = createHash('sha256').update(pluginFolder).digest('base64url').slice(0, 21);

        const failure = PluginService.pluginFailures.get(pluginFolder);
        if (failure) {
          PluginService.setPluginLoadError(`${manifest.name}@${manifest.version}`, new Error(failure.message));
        }

        try {
          manifest.permissions = PluginSandboxService.validateDeclaredPermissions(manifest.name, manifest.permissions);
        } catch (error) {
          PluginService.setPluginLoadError(`${manifest.name}@${manifest.version}`, error as Error);
          return null;
        }

        return manifest;
      })
      .filter((manifest) => manifest !== null);
  }

  private static findPluginManifestInPluginFolder(rootFolder: string, pluginFolder: string): PluginManifest | null {
    const manifestPath = join(rootFolder, pluginFolder, 'plugin.json');

    if (!existsSync(manifestPath)) {
      PluginService.logger.log(`No manifest found at ${manifestPath}`);
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

  private static readFailures(): PluginFailure[] {
    return PluginService.readJsonFile<PluginFailure[]>(PLUGIN_FAILURES_FILE, []);
  }

  private static writeFailures(failures: PluginFailure[]): void {
    PluginService.writeJsonFile(PLUGIN_FAILURES_FILE, failures);
  }

  private static readBootGuard(): string[] {
    return PluginService.readJsonFile<string[]>(PLUGIN_BOOT_GUARD_FILE, []);
  }

  private static writeBootGuard(pluginDirectories: string[]): void {
    PluginService.writeJsonFile(PLUGIN_BOOT_GUARD_FILE, pluginDirectories);
  }

  private static readJsonFile<T>(name: string, fallback: T): T {
    try {
      const value: unknown = JSON.parse(readFileSync(join(PluginService.PLUGIN_PATH, name), 'utf8'));
      return Array.isArray(fallback) && !Array.isArray(value) ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  private static writeJsonFile(name: string, value: unknown): void {
    mkdirSync(PluginService.PLUGIN_PATH, { recursive: true });
    const path = join(PluginService.PLUGIN_PATH, name);
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(value));
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  public async uploadPlugin(zipFile: FileUpload) {
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

      // if folder exists throw error
      const pluginFolder = join(PluginService.PLUGIN_PATH, manifest.name);
      PluginService.logger.debug(`Checking if plugin folder ${pluginFolder} exists`, pluginFolder);
      if (existsSync(pluginFolder)) {
        PluginService.logger.error(`Plugin ${manifest.name} already exists`);
        throw new BadRequestException('Plugin already exists');
      }

      // move plugin to plugins folder
      PluginService.logger.debug(`Moving plugin to plugins folder ${pluginFolder}`);
      await rename(sourceFolder, pluginFolder);
      try {
        PluginService.clearPluginQuarantine(manifest.name);
      } catch (error) {
        PluginService.logger.error(`Failed to clear quarantine for uploaded plugin ${manifest.name}`, error as Error);
      }

      // restart app in 1 second
      setTimeout(() => {
        this.restartApp();
      }, 1000);

      // return manifest
      PluginService.logger.debug(`Returning manifest ${manifest}`);
      return manifest;
    } finally {
      await rm(tempFolder, { recursive: true, force: true });
    }
  }

  private static findManifestFolder(tempFolder: string): string {
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

  private restartApp() {
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

  public async deletePlugin(pluginId: string) {
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
          error as Error
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
    setTimeout(() => {
      this.restartApp();
    }, 1000);
  }
}
