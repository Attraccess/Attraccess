import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import decompress from 'decompress';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { rename, rm } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { FileUpload } from '../common/types/file-upload.types';
import { PluginManifestLoadingImplementation } from './plugin-manifest-loading';
import { PluginManifestSchema } from './plugin.manifest';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export abstract class PluginZipInstallationImplementation extends PluginManifestLoadingImplementation {
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
}
