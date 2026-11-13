import { type PluginService } from '../plugin.service';

import { randomBytes } from 'crypto';

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';

import { join } from 'path';

import { LoadedPluginManifest } from '../plugin.manifest';

import { Logger } from '@nestjs/common';

function getImplementationClass(): typeof PluginService {
  return require('../plugin.service').PluginService;
}

export const INTERNAL_PLUGIN_DIRECTORIES = new Set([
  '.npm-backups',
  '.plugin-failures.json',
  '.plugin-boot-guard.json',
]);

export const PLUGIN_FAILURES_FILE = '.plugin-failures.json';

export const PLUGIN_BOOT_GUARD_FILE = '.plugin-boot-guard.json';

export type PluginFailure = { pluginDirectory: string; message: string };

/**
 * The boot guard and quarantine of plugins that kept the host from starting. It owns the quarantine state and its
 * files, and reads the plugin directory and discovered plugins from PluginService, which exposes these steps.
 */
export class PluginBootGuard {
  private static pluginFailures: Map<string, PluginFailure> = new Map();

  private static readonly logger = new Logger('PluginService');

  private static bootGuardSignalHandlers: Partial<Record<'SIGINT' | 'SIGTERM', () => void>> = {};

  /** Reloads the persisted quarantine from the configured plugin directory. */
  static loadFailures(): void {
    PluginBootGuard.pluginFailures = new Map(
      PluginBootGuard.readFailures().map((failure) => [failure.pluginDirectory, failure]),
    );
  }

  /** Marks active plugins only while Nest is running their lifecycle hooks. */
  static beginBootGuard(): void {
    PluginBootGuard.removeBootGuardSignalHandlers();
    const previous = PluginBootGuard.readBootGuard();
    if (previous.length > 0) {
      for (const pluginDirectory of previous) {
        if (!PluginBootGuard.pluginFailures.has(pluginDirectory)) {
          PluginBootGuard.pluginFailures.set(pluginDirectory, {
            pluginDirectory,
            message: 'Plugin was disabled after an incomplete startup with no attributable stack frame.',
          });
        }
      }
      PluginBootGuard.writeFailures([...PluginBootGuard.pluginFailures.values()]);
      PluginBootGuard.logger.error(`Disabled ${previous.length} plugin(s) after an incomplete previous startup.`);
    }

    const active = getImplementationClass()
      .getPlugins()
      .filter((manifest) => !PluginBootGuard.pluginFailures.has(manifest.pluginDirectory))
      .map((manifest) => manifest.pluginDirectory);
    PluginBootGuard.writeBootGuard(active);
    // A dev watcher or operator may stop the process during migrations or app.init().
    // That is an intentional shutdown, not evidence that every plugin crashed.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = () => {
        PluginBootGuard.clearBootGuard();
        // Before Nest registers shutdown hooks, removing our listener restores
        // Node's normal signal termination. Once Nest is listening, let it close.
        if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
      };
      PluginBootGuard.bootGuardSignalHandlers[signal] = handler;
      process.once(signal, handler);
    }
  }

  /**
   * Records the error that prevented the guarded startup from completing so the
   * next process can show the actionable cause rather than a generic warning.
   */
  static recordBootFailure(error: unknown): void {
    const active = PluginBootGuard.readBootGuard();
    if (active.length === 0) return;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const affected = active.filter((pluginDirectory) =>
      stack.includes(join(getImplementationClass().PLUGIN_PATH, pluginDirectory)),
    );
    if (affected.length === 0) {
      PluginBootGuard.logger.error('Could not attribute the startup failure to a plugin; no plugins were quarantined.');
      return;
    }

    for (const pluginDirectory of affected) {
      PluginBootGuard.pluginFailures.set(pluginDirectory, { pluginDirectory, message });
    }
    PluginBootGuard.writeFailures([...PluginBootGuard.pluginFailures.values()]);
  }

  static clearBootGuard(): void {
    PluginBootGuard.removeBootGuardSignalHandlers();
    const path = join(getImplementationClass().PLUGIN_PATH, PLUGIN_BOOT_GUARD_FILE);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  static removeBootGuardSignalHandlers(): void {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = PluginBootGuard.bootGuardSignalHandlers[signal];
      if (handler) process.removeListener(signal, handler);
    }
    PluginBootGuard.bootGuardSignalHandlers = {};
  }

  /**
   * Persist a failed plugin outside its package. A subsequent process must never
   * retry code which already prevented the host from starting.
   */
  static quarantinePlugin(manifest: LoadedPluginManifest, error: Error): void {
    const key = `${manifest.name}@${manifest.version}`;
    getImplementationClass().setPluginLoadError(key, error);
    try {
      PluginBootGuard.quarantinePluginDirectory(manifest.pluginDirectory, error);
    } catch (persistenceError) {
      PluginBootGuard.logger.error(`Failed to persist quarantine for ${key}`, persistenceError as Error);
    }
  }

  static quarantinePluginDirectory(pluginDirectory: string, error: Error): void {
    PluginBootGuard.pluginFailures.set(pluginDirectory, { pluginDirectory, message: error.message });
    PluginBootGuard.writeFailures([...PluginBootGuard.pluginFailures.values()]);
  }

  static isQuarantined(pluginDirectory: string): boolean {
    return PluginBootGuard.pluginFailures.has(pluginDirectory);
  }

  static pluginQuarantineError(pluginDirectory: string): string | undefined {
    return PluginBootGuard.pluginFailures.get(pluginDirectory)?.message;
  }

  static clearPluginQuarantine(pluginDirectory: string): void {
    const failure = PluginBootGuard.pluginFailures.get(pluginDirectory);
    if (!failure) return;

    PluginBootGuard.pluginFailures.delete(pluginDirectory);
    try {
      PluginBootGuard.writeFailures([...PluginBootGuard.pluginFailures.values()]);
    } catch (error) {
      PluginBootGuard.pluginFailures.set(pluginDirectory, failure);
      throw error;
    }
  }

  private static readFailures(): PluginFailure[] {
    return PluginBootGuard.readJsonFile<PluginFailure[]>(PLUGIN_FAILURES_FILE, []);
  }

  private static writeFailures(failures: PluginFailure[]): void {
    PluginBootGuard.writeJsonFile(PLUGIN_FAILURES_FILE, failures);
  }

  private static readBootGuard(): string[] {
    return PluginBootGuard.readJsonFile<string[]>(PLUGIN_BOOT_GUARD_FILE, []);
  }

  private static writeBootGuard(pluginDirectories: string[]): void {
    PluginBootGuard.writeJsonFile(PLUGIN_BOOT_GUARD_FILE, pluginDirectories);
  }

  private static readJsonFile<T>(name: string, fallback: T): T {
    try {
      const value: unknown = JSON.parse(readFileSync(join(getImplementationClass().PLUGIN_PATH, name), 'utf8'));
      return Array.isArray(fallback) && !Array.isArray(value) ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  private static writeJsonFile(name: string, value: unknown): void {
    mkdirSync(getImplementationClass().PLUGIN_PATH, { recursive: true });
    const path = join(getImplementationClass().PLUGIN_PATH, name);
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(value));
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
}
