import { BadRequestException, Logger } from '@nestjs/common';

import { spawn } from 'child_process';

import { existsSync, readdirSync, readFileSync } from 'fs';

import { mkdir, mkdtemp, rm, rmdir, rename } from 'fs/promises';

import { join, basename, isAbsolute, relative, resolve } from 'path';

import { randomBytes, createHash } from 'crypto';

import decompress from 'decompress';

import { FileUpload } from '../common/types/file-upload.types';

import { PluginManifestSchema, LoadedPluginManifest, PluginManifest } from './plugin.manifest';

import { type PluginManifestInfo } from '@attraccess/plugins-backend-sdk';

import { assertBundleCompatible, assertManifestCompatible } from './runtime/plugin-compatibility';
import { assertInstallableNamespace } from './plugin-storage/storage-loader';
import { PluginBootGuard } from './runtime/boot-guard';

import { PluginSandboxService } from './plugin-sandbox.service';

import { INTERNAL_PLUGIN_DIRECTORIES } from './runtime/boot-guard';

import {
  licenseShortfall,
  missingLicenseReason,
  parseManifestLicense,
  type PluginLicenseShortfall,
  type PluginLicenseSnapshot,
  withRequiringPlugins,
} from './license/plugin-license';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export class PluginService {
  public static PLUGIN_PATH: string;

  protected static RESTART_BY_EXIT_FLAG: boolean;

  /** Every discovered manifest, including the ones the host refuses to load (see {@link refusedPlugins}). */
  protected static plugins: LoadedPluginManifest[] | null = null;

  /**
   * Plugin directories whose manifest the host refuses (an SDK 1.x plugin, an unsupported database engine, invalid
   * permissions). They stay listed with their error so an admin can see and delete them, but their code is never
   * loaded, migrated or reverted.
   */
  protected static refusedPlugins: Set<string> = new Set();

  /** {@link getPlugins} cached per discovery scan, so callers see one stable array between scans. */
  protected static loadablePlugins: { source: LoadedPluginManifest[]; plugins: LoadedPluginManifest[] } | null = null;

  protected static loadedPlugins: Set<string> = new Set();

  protected static pluginLoadErrors: Map<string, Error> = new Map();

  /**
   * The license as it was at startup, which decided which plugins loaded. `null` until the startup evaluation ran
   * (and while plugins are disabled); a gate with a `null` snapshot means the license could not be determined.
   */
  protected static licenseGate: { snapshot: PluginLicenseSnapshot } | null = null;

  protected static logger = new Logger('PluginService');

  protected static readonly UPLOAD_STAGING_PREFIX = '.zip-upload-';

  protected static readonly pluginUploadLocks = new Map<string, Promise<void>>();

  /**
   * Marks active plugins only while Nest is running their lifecycle hooks. Plugins the startup license keeps out (and
   * plugins that require them) never run, so they are not marked: an incomplete startup must not quarantine them.
   */
  public static beginBootGuard(): void {
    // The startup license check may already have discovered the plugins. Discover again once the previous startup's
    // plugins are quarantined, so discovery reports them as failed with their quarantine message.
    getImplementationClass().plugins = null;
    return PluginBootGuard.beginBootGuard(getImplementationClass().PLUGIN_PATH, () => {
      const blocked = getImplementationClass().licenseBlockedPluginNames();
      return getImplementationClass()
        .getPlugins()
        .filter((manifest) => !blocked.has(manifest.name));
    });
  }

  /** Plugins the startup license keeps out, plus every plugin that requires one of them (transitively). */
  public static licenseBlockedPluginNames(): Set<string> {
    const plugins = getImplementationClass().getPlugins();
    const unlicensed = plugins.filter((manifest) => getImplementationClass().getLicenseMissingReason(manifest));
    return withRequiringPlugins(plugins, new Set(unlicensed.map((manifest) => manifest.name)));
  }

  /**
   * Records the error that prevented the guarded startup from completing so the
   * next process can show the actionable cause rather than a generic warning.
   */
  public static recordBootFailure(error: unknown): void {
    return PluginBootGuard.recordBootFailure(getImplementationClass().PLUGIN_PATH, error);
  }

  public static clearBootGuard(): void {
    return PluginBootGuard.clearBootGuard(getImplementationClass().PLUGIN_PATH);
  }

  /**
   * Persist a failed plugin outside its package. A subsequent process must never
   * retry code which already prevented the host from starting.
   */
  public static quarantinePlugin(manifest: LoadedPluginManifest, error: Error): void {
    const key = `${manifest.name}@${manifest.version}`;
    getImplementationClass().setPluginLoadError(key, error);
    try {
      PluginBootGuard.quarantinePluginDirectory(getImplementationClass().PLUGIN_PATH, manifest.pluginDirectory, error);
    } catch (persistenceError) {
      getImplementationClass().logger.error(`Failed to persist quarantine for ${key}`, persistenceError as Error);
    }
  }

  public static quarantinePluginDirectory(pluginDirectory: string, error: Error): void {
    return PluginBootGuard.quarantinePluginDirectory(getImplementationClass().PLUGIN_PATH, pluginDirectory, error);
  }

  public static pluginQuarantineError(pluginDirectory: string): string | undefined {
    return PluginBootGuard.pluginQuarantineError(pluginDirectory);
  }

  public static clearPluginQuarantine(pluginDirectory: string): void {
    return PluginBootGuard.clearPluginQuarantine(getImplementationClass().PLUGIN_PATH, pluginDirectory);
  }

  public static configure(config: { PLUGIN_DIR: string; RESTART_BY_EXIT: boolean }): void {
    PluginBootGuard.removeBootGuardSignalHandlers();
    getImplementationClass().PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    getImplementationClass().RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
    getImplementationClass().plugins = null; // Discovery may have been cached with an unset path before configure() ran; force a re-scan.
    getImplementationClass().refusedPlugins.clear();
    getImplementationClass().loadedPlugins.clear();
    getImplementationClass().pluginLoadErrors.clear();
    getImplementationClass().licenseGate = null;
    PluginBootGuard.loadFailures(getImplementationClass().PLUGIN_PATH);
    getImplementationClass().logger.log(
      `PluginService configured. Path: ${getImplementationClass().PLUGIN_PATH}, RestartByExit: ${getImplementationClass().RESTART_BY_EXIT_FLAG}`,
    );
    if (!getImplementationClass().PLUGIN_PATH) {
      getImplementationClass().logger.error('PLUGIN_DIR is not configured in AppConfig! Plugin system may not work.');
    }
  }

  /** Records the license the startup evaluation saw. Must run before PluginModule.forRoot() decides what loads. */
  public static setLicenseSnapshot(snapshot: PluginLicenseSnapshot): void {
    getImplementationClass().licenseGate = { snapshot };
  }

  /** How the startup license fails the plugin's `license` block; null when it satisfies it or none is declared. */
  public static getLicenseShortfall(manifest: Pick<LoadedPluginManifest, 'license'>): PluginLicenseShortfall | null {
    const gate = getImplementationClass().licenseGate;
    return gate ? licenseShortfall(manifest.license, gate.snapshot) : null;
  }

  /** Why the startup license does not satisfy the plugin's `license` block; null when it does or none is declared. */
  public static getLicenseMissingReason(manifest: Pick<LoadedPluginManifest, 'license'>): string | null {
    return getImplementationClass().getLicenseShortfall(manifest)?.message ?? null;
  }

  /**
   * Whether `next` would change the load decision of at least one license-gated plugin compared to the license
   * the process started with. Without a startup evaluation (plugins disabled) nothing is gated, so nothing changes.
   * Quarantined plugins do not count: they stay unloaded after a restart.
   */
  public static licenseDecisionChanges(next: PluginLicenseSnapshot): boolean {
    const gate = getImplementationClass().licenseGate;
    if (!gate) return false;
    // A quarantined plugin stays unloaded after a restart whatever the license says.
    return getImplementationClass()
      .getPlugins()
      .filter((manifest) => !getImplementationClass().isPluginQuarantined(manifest))
      .some(
        (manifest) =>
          (missingLicenseReason(manifest.license, gate.snapshot) === null) !==
          (missingLicenseReason(manifest.license, next) === null),
      );
  }

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

  public async uploadPlugin(zipFile: FileUpload, deferRestart = false) {
    // check if file is a zip file
    if (zipFile.mimetype !== 'application/zip') {
      PluginService.logger.error(`File ${zipFile.originalname} is not a zip file`);
      throw new BadRequestException('File must be a zip file');
    }

    // unzip file
    PluginService.logger.debug(`Unzipping file ${zipFile.originalname}`);
    // One dot-prefixed staging folder per upload inside the plugin folder: no shared parent
    // to leave behind or race on, discovery skips it, and rename() stays on one filesystem.
    await mkdir(PluginService.PLUGIN_PATH, { recursive: true });
    const stagingFolder = await mkdtemp(join(PluginService.PLUGIN_PATH, PluginService.UPLOAD_STAGING_PREFIX));
    // Extract one level down, like the npm path's `package` folder: the private (0700) mkdtemp
    // folder itself must never be renamed into place as the plugin folder.
    const extractFolder = join(stagingFolder, 'contents');

    try {
      let extracted: unknown[] = [];
      try {
        extracted = await decompress(zipFile.buffer, extractFolder);
      } catch (error) {
        PluginService.logger.error(`Failed to extract ${zipFile.originalname}`, error as Error);
      }

      // a non-zip buffer decompresses to nothing instead of throwing
      if (extracted.length === 0) {
        throw new BadRequestException('File could not be extracted, it must be a valid zip file');
      }

      // read manifest, tolerating the single wrapper folder that Finder and most GUI zip tools add
      const sourceFolder = PluginService.findManifestFolder(extractFolder);
      PluginService.logger.debug(`Reading manifest from ${sourceFolder}`);
      const manifestContent = JSON.parse(readFileSync(join(sourceFolder, 'plugin.json'), 'utf8'));

      // validate manifest. The SDK 2.0 contract is checked on the raw manifest first, so a plugin still built for
      // SDK 1.x (the removed DATABASE_ACCESS permission, an engine list, TypeORM migrations, database imports) gets
      // the refusal that names it instead of a schema error. Refused before anything moves: no files, no database.
      PluginService.logger.debug(`Validating manifest`, manifestContent);
      try {
        PluginService.assertManifestCompatible(manifestContent);
        if (manifestContent?.main?.backend?.directory) {
          assertBundleCompatible(manifestContent.name, join(sourceFolder, manifestContent.main.backend.directory));
        }
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const parsed = PluginManifestSchema.safeParse(manifestContent);
      if (!parsed.success) {
        // A client error with the offending fields, not a 500: nothing was moved or changed.
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'plugin.json'}: ${issue.message}`);
        throw new BadRequestException(`Invalid plugin.json: ${issues.join('; ')}`);
      }
      const manifest = parsed.data;
      // A storage namespace another installed plugin has (or keeps tables in) is refused before anything moves.
      try {
        assertInstallableNamespace(manifest, () => PluginService.getPlugins());
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }

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
      await PluginService.cleanupUploadStaging(stagingFolder);
    }
  }

  /** Best effort: cleanup problems must never change the upload's result. */
  protected static async cleanupUploadStaging(stagingFolder: string): Promise<void> {
    try {
      await rm(stagingFolder, { recursive: true, force: true });
    } catch (error) {
      PluginService.logger.warn(`Failed to remove upload staging folder ${stagingFolder}`, error as Error);
    }
    // Earlier versions staged uploads in a shared `temp` folder. Non-recursive on purpose:
    // only an empty folder goes, a plugin named `temp` stays untouched.
    try {
      await rmdir(join(PluginService.PLUGIN_PATH, 'temp'));
    } catch (error) {
      PluginService.logger.debug(`Legacy temp folder not removed: ${(error as Error).message}`);
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

  /** The plugins the host may load, migrate and serve. Refused manifests are left out. */
  public static getPlugins(): LoadedPluginManifest[] {
    const discovered = getImplementationClass().getDiscoveredPlugins();
    if (getImplementationClass().loadablePlugins?.source !== discovered) {
      getImplementationClass().loadablePlugins = {
        source: discovered,
        plugins: discovered.filter((plugin) => !getImplementationClass().isPluginRefused(plugin)),
      };
    }
    return getImplementationClass().loadablePlugins.plugins;
  }

  /** Every plugin found in the plugin folder, including refused ones; for listing and removal only. */
  public static getDiscoveredPlugins(): LoadedPluginManifest[] {
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

  /** Whether discovery refused the manifest: its code must never run (no load, no migration, no revert). */
  public static isPluginRefused(manifest: Pick<LoadedPluginManifest, 'pluginDirectory'>): boolean {
    return getImplementationClass().refusedPlugins.has(manifest.pluginDirectory);
  }

  public static getManifestById(id: string): LoadedPluginManifest | undefined {
    return getImplementationClass()
      .getDiscoveredPlugins()
      .find((plugin) => plugin.id === id);
  }

  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.
  public static getPluginsWithLoadStatus(): LoadedPluginManifest[] {
    return getImplementationClass()
      .getDiscoveredPlugins()
      .map((manifest) => {
        const key = `${manifest.name}@${manifest.version}`;
        // A refused plugin never loads whatever the license says; its refusal is the actionable error.
        const shortfall = getImplementationClass().isPluginRefused(manifest)
          ? null
          : getImplementationClass().getLicenseShortfall(manifest);
        if (shortfall) {
          return {
            ...manifest,
            status: 'license_missing' as const,
            error: shortfall.message,
            missingLicenseModules: shortfall.missingModules,
          };
        }

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
    return PluginBootGuard.isQuarantined(manifest.pluginDirectory);
  }

  protected static findPluginsInFolder(rootFolder: string): LoadedPluginManifest[] {
    // if folder does not exist, return empty array
    if (!existsSync(rootFolder)) {
      return [];
    }

    // Sorted: readdir order differs between file systems, and the first plugin to declare a permission key owns it.
    const potentialPluginFolders = readdirSync(rootFolder).sort();
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

        const failure = PluginBootGuard.pluginQuarantineError(pluginFolder);
        if (failure !== undefined) {
          getImplementationClass().setPluginLoadError(`${manifest.name}@${manifest.version}`, new Error(failure));
        }

        try {
          PluginService.assertManifestCompatible(manifest);
          // The bundle is read, never run: a database import refuses the plugin before any of its code loads.
          if (manifest.main?.backend?.directory) {
            assertBundleCompatible(manifest.name, join(rootFolder, manifest.main.backend.directory));
          }
          manifest.permissions = PluginSandboxService.validateDeclaredPermissions(manifest.name, manifest.permissions);
          // A malformed license block is refused like invalid permissions: the host cannot tell what it requires.
          const license = parseManifestLicense(manifest.name, manifest.license);
          if (license) manifest.license = license;
        } catch (error) {
          // Listed with the refusal (and its migration guide) so it can be deleted, but never loaded or migrated.
          getImplementationClass().setPluginLoadError(`${manifest.name}@${manifest.version}`, error as Error);
          getImplementationClass().refusedPlugins.add(pluginFolder);
        }

        return manifest;
      })
      .filter((manifest) => manifest !== null);
  }

  /** The SDK 2.0 contract of a manifest, checked before a plugin is installed, started or migrated. */
  protected static assertManifestCompatible(manifest: Parameters<typeof assertManifestCompatible>[0]): void {
    assertManifestCompatible(manifest);
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

    // A legacy migrations entry is kept as written: it is refused (SDK 2.0 has none), never resolved or run.

    return manifest;
  }
}
