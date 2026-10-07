import { Logger } from '@nestjs/common';
import { LoadedPluginManifest, PluginManifest } from './plugin.manifest';

export const INTERNAL_PLUGIN_DIRECTORIES = new Set([
  '.npm-backups',
  '.plugin-failures.json',
  '.plugin-boot-guard.json',
]);

export const PLUGIN_FAILURES_FILE = '.plugin-failures.json';

export const PLUGIN_BOOT_GUARD_FILE = '.plugin-boot-guard.json';

export type PluginFailure = { pluginDirectory: string; message: string };

export abstract class PluginServiceRouteContext {
  declare protected static removeBootGuardSignalHandlers: () => void;
  public static PLUGIN_PATH: string;
  protected static RESTART_BY_EXIT_FLAG: boolean;
  protected static plugins: LoadedPluginManifest[] | null = null;
  protected static loadedPlugins: Set<string> = new Set();
  protected static pluginLoadErrors: Map<string, Error> = new Map();
  protected static pluginFailures: Map<string, PluginFailure> = new Map();
  declare protected static readFailures: () => PluginFailure[];
  protected static logger = new Logger('PluginService');
  declare protected static findPluginsInFolder: (rootFolder: string) => LoadedPluginManifest[];
  declare public static getPlugins: () => LoadedPluginManifest[];
  declare public static setPluginLoadError: (pluginName: string, error: Error) => void;
  declare public static quarantinePluginDirectory: (pluginDirectory: string, error: Error) => void;
  declare protected static writeFailures: (failures: PluginFailure[]) => void;
  declare protected static readBootGuard: () => string[];
  declare protected static writeBootGuard: (pluginDirectories: string[]) => void;
  declare public static clearBootGuard: () => void;
  protected static bootGuardSignalHandlers: Partial<Record<'SIGINT' | 'SIGTERM', () => void>> = {};
  declare protected static findPluginManifestInPluginFolder: (
    rootFolder: string,
    pluginFolder: string,
  ) => PluginManifest | null;
  declare protected static readJsonFile: <T>(name: string, fallback: T) => T;
  declare protected static writeJsonFile: (name: string, value: unknown) => void;
  declare protected static findManifestFolder: (tempFolder: string) => string;
  declare protected static safePluginName: (name: string) => string;
  declare protected static withPluginUploadLock: <T>(pluginName: string, action: () => Promise<T>) => Promise<T>;
  public abstract requestRestart(): void;
  declare public static clearPluginQuarantine: (pluginDirectory: string) => void;
  protected static readonly pluginUploadLocks = new Map<string, Promise<void>>();
  protected abstract restartApp(): void;
}
