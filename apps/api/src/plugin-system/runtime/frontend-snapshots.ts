import { Logger } from '@nestjs/common';
import { cpSync, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';

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

const snapshotRoot = (pluginPath: string) => join(pluginPath, FRONTEND_SNAPSHOT_DIRECTORY);

/** Called at boot: the plugins loaded now are the ones on disk, so earlier snapshots are stale. A failure is logged. */
export function clearFrontendSnapshots(pluginPath: string): void {
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
export function snapshotRunningFrontend(
  pluginPath: string,
  running: readonly SnapshotPlugin[],
  pluginDirectory: string,
): void {
  try {
    snapshotPluginFrontend(
      pluginPath,
      running.find((plugin) => plugin.pluginDirectory === pluginDirectory),
    );
  } catch (error) {
    logger.error(`Failed to keep the running frontend of ${pluginDirectory}`, error as Error);
  }
}

/**
 * Copies the loaded frontend of `plugin` before its folder is replaced. The first copy wins: a second update before the
 * restart must keep serving the version that runs. Symlinks are copied as they are, so the asset route's checks still
 * refuse any that leave the snapshot.
 */
export function snapshotPluginFrontend(pluginPath: string, plugin: SnapshotPlugin | undefined): void {
  const frontend = plugin?.main.frontend?.directory;
  if (!frontend) return;
  const source = resolve(pluginPath, frontend);
  const target = resolve(snapshotRoot(pluginPath), frontend);
  if (existsSync(target) || !existsSync(source)) return;
  cpSync(source, target, { recursive: true, verbatimSymlinks: true });
}

/** The root to serve `plugin`'s frontend from: its snapshot when an update replaced it on disk, else `pluginPath`. */
export function frontendAssetRoot(pluginPath: string, plugin: SnapshotPlugin): string {
  const frontend = plugin.main.frontend?.directory;
  const root = snapshotRoot(pluginPath);
  return frontend && existsSync(resolve(root, frontend)) ? root : pluginPath;
}
