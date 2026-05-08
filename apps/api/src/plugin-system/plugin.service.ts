import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { PluginManifest, PluginManifestSchema, LoadedPluginManifest } from './plugin.manifest';
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
  public static PLUGIN_PATH: string;
  private static RESTART_BY_EXIT_FLAG: boolean;

  public static configure(config: { PLUGIN_DIR: string, RESTART_BY_EXIT: boolean }): void {
    PluginService.PLUGIN_PATH = config.PLUGIN_DIR; // Assume PLUGIN_DIR from appConfig is already resolved or correct
    PluginService.RESTART_BY_EXIT_FLAG = config.RESTART_BY_EXIT;
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
        if (manifest) {
          manifest.pluginDirectory = pluginFolder;
          manifest.id = randomBytes(16).toString('base64url').slice(0, 21);
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
