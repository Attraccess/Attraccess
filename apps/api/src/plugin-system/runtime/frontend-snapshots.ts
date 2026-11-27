import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, realpathSync, rmSync } from 'fs';
import { cp, mkdir, rename, rm } from 'fs/promises';
import { dirname, join, relative, resolve, sep } from 'path';

/**
 * Plugin changes wait for a restart, but a plugin's frontend files are served from its folder on disk. Before an update
 * overwrites that folder, the running version's frontend is copied here, and served from here until the restart, so
 * browsers keep getting the frontend that matches the backend still running. A dot folder: discovery skips it.
 */
export const FRONTEND_SNAPSHOT_DIRECTORY = '.frontend-snapshots';

interface SnapshotPlugin {
  pluginDirectory: string;
  main: { frontend?: { directory: string } | null };
}

const logger = new Logger('PluginFrontendSnapshots');

/**
 * The plugin directories whose frontend this process snapshotted. Only these are served from a snapshot: a folder left
 * behind by an earlier process (a failed cleanup, another instance sharing the plugin folder) never is.
 */
const snapshotted = new Set<string>();

const snapshotRoot = (pluginPath: string) => join(pluginPath, FRONTEND_SNAPSHOT_DIRECTORY);

const isStrictlyInside = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep) && resolve(parent, path) === child;
};

const realpathOrNull = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

/** Called at boot: the plugins loaded now are the ones on disk, so earlier snapshots are stale. A failure is logged. */
export function clearFrontendSnapshots(pluginPath: string): void {
  snapshotted.clear();
  if (!pluginPath) return;
  try {
    rmSync(snapshotRoot(pluginPath), { recursive: true, force: true });
  } catch (error) {
    logger.error('Failed to clear plugin frontend snapshots', error as Error);
  }
}

/**
 * Keeps serving the running frontend of the plugin in `pluginDirectory` (one of the `running` plugins, as discovered at
 * boot) before an update replaces its folder. A failure is logged: the update goes on, and the new files are served.
 */
export async function snapshotRunningFrontend(
  pluginPath: string,
  running: readonly SnapshotPlugin[],
  pluginDirectory: string,
): Promise<void> {
  try {
    await snapshotPluginFrontend(
      pluginPath,
      running.find((plugin) => plugin.pluginDirectory === pluginDirectory),
    );
  } catch (error) {
    logger.error(`Failed to keep the running frontend of ${pluginDirectory}`, error as Error);
  }
}

/**
 * Copies the loaded frontend of `plugin` before its folder is replaced. The first copy wins: a second update before the
 * restart must keep serving the version that runs. Only a frontend inside its plugin folder, inside `pluginPath`, is
 * copied (as the asset route would serve it); the copy is complete or absent, never partial. Asynchronous on purpose:
 * Node's `cpSync` aborts the whole process on an unreadable directory.
 */
export async function snapshotPluginFrontend(pluginPath: string, plugin: SnapshotPlugin | undefined): Promise<void> {
  const frontend = plugin?.main.frontend?.directory;
  if (!plugin || !frontend || snapshotted.has(plugin.pluginDirectory)) return;
  const pluginsRoot = realpathOrNull(pluginPath);
  const pluginDir = realpathOrNull(resolve(pluginPath, plugin.pluginDirectory));
  const source = realpathOrNull(resolve(pluginPath, frontend));
  if (!pluginsRoot || !pluginDir || !source) return;
  if (!isStrictlyInside(pluginsRoot, pluginDir) || !(source === pluginDir || isStrictlyInside(pluginDir, source))) {
    logger.warn(`Not keeping the frontend of ${plugin.pluginDirectory}: it lies outside its plugin folder`);
    return;
  }
  const root = resolve(pluginsRoot, FRONTEND_SNAPSHOT_DIRECTORY);
  const target = resolve(root, relative(pluginsRoot, resolve(pluginsRoot, frontend)));
  if (!isStrictlyInside(root, target)) return;
  const staging = join(root, `.staging-${randomBytes(8).toString('hex')}`);
  await mkdir(root, { recursive: true });
  try {
    await cp(source, staging, { recursive: true, verbatimSymlinks: true });
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await rename(staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  snapshotted.add(plugin.pluginDirectory);
}

/** The root to serve `plugin`'s frontend from: its snapshot when an update replaced it on disk, else `pluginPath`. */
export function frontendAssetRoot(pluginPath: string, plugin: SnapshotPlugin): string {
  const root = snapshotRoot(pluginPath);
  const frontend = plugin.main.frontend?.directory;
  return snapshotted.has(plugin.pluginDirectory) && frontend && existsSync(resolve(root, frontend)) ? root : pluginPath;
}
