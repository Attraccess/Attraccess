import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import type { PluginManifestInfo } from '@attraccess/plugins-backend-sdk';
import { PluginManifest, PluginManifestSchema, LoadedPluginManifest } from './plugin.manifest';
import { PluginSandboxService } from './plugin-sandbox.service';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { FileUpload } from '../common/types/file-upload.types';
import { rename, rm } from 'fs/promises';
import decompress from 'decompress';
import { randomBytes } from 'crypto';
import { spawn } from 'child_process';



export class PluginService {

  private static plugins: LoadedPluginManifest[] | null = null;
  private static loadedPlugins: Set<string> = new Set();
  private static pluginLoadErrors: Map<string, Error> = new Map();
  private static logger = new Logger(PluginService.name);
  // Seeded from the PLUGIN_DIR env var so it is already set when AppModule is
  // imported. PluginModule.forRoot() — which imports each plugin's backend
  // module — runs at that import, before bootstrap() calls configure(); without
  // this seed the path is undefined at forRoot time and no plugin backends load.
  // configure() still overrides it from AppConfig for completeness.
  public static PLUGIN_PATH: string = process.env.PLUGIN_DIR as string;
  private static RESTART_BY_EXIT_FLAG: boolean;

  public static configure(config: { PLUGIN_DIR: string, RESTART_BY_EXIT: boolean }): void {
    PluginService.PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    PluginService.RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
    PluginService.plugins = null; // Discovery may have been cached with an unset path before configure() ran; force a re-scan.
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

  private static findPluginsInFolder(rootFolder: string): LoadedPluginManifest[] {
    // if folder does not exist, return empty array
    if (!existsSync(rootFolder)) {
      return [];
    }

    const potentialPluginFolders = readdirSync(rootFolder);

    PluginService.logger.log(`Found ${potentialPluginFolders.length} folders in ${rootFolder}`);

    return potentialPluginFolders
      .map((pluginFolder) => {
        const manifest = PluginService.findPluginManifestInPluginFolder(
          rootFolder,
          pluginFolder
        ) as LoadedPluginManifest | null;
        if (!manifest) {
          return null;
        }

        manifest.pluginDirectory = pluginFolder;
        manifest.id = randomBytes(16).toString('base64url').slice(0, 21);

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

    return manifest;
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
    await decompress(zipFile.buffer, tempFolder);

    // read manifest
    PluginService.logger.debug(`Reading manifest from ${tempFolder}`);
    const manifestPath = join(tempFolder, 'plugin.json');
    const manifestContent = JSON.parse(readFileSync(manifestPath, 'utf8'));

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
    await rename(tempFolder, pluginFolder);

    // restart app in 1 second
    setTimeout(() => {
      this.restartApp();
    }, 1000);

    // return manifest
    PluginService.logger.debug(`Returning manifest ${manifest}`);
    return manifest;
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

    // delete folder
    await rm(pluginFolder, { recursive: true });

    // restart app
    setTimeout(() => {
      this.restartApp();
    }, 1000);
  }
}
