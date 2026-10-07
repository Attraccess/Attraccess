import type { PluginService } from './plugin.service';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { LoadedPluginManifest } from './plugin.manifest';
import { PLUGIN_BOOT_GUARD_FILE, PLUGIN_FAILURES_FILE, PluginFailure } from './plugin.service.route-context';
import { PluginServiceRouteContext } from './plugin.service.route-context';

function getImplementationClass(): typeof PluginService {
  return require('./plugin.service').PluginService;
}

export abstract class PluginBootGuardImplementation extends PluginServiceRouteContext {
  /** Marks active plugins only while Nest is running their lifecycle hooks. */
  public static beginBootGuard(): void {
    getImplementationClass().removeBootGuardSignalHandlers();
    const previous = getImplementationClass().readBootGuard();
    if (previous.length > 0) {
      for (const pluginDirectory of previous) {
        if (!getImplementationClass().pluginFailures.has(pluginDirectory)) {
          getImplementationClass().pluginFailures.set(pluginDirectory, {
            pluginDirectory,
            message: 'Plugin was disabled after an incomplete startup with no attributable stack frame.',
          });
        }
      }
      getImplementationClass().writeFailures([...getImplementationClass().pluginFailures.values()]);
      getImplementationClass().logger.error(
        `Disabled ${previous.length} plugin(s) after an incomplete previous startup.`,
      );
    }

    const active = getImplementationClass()
      .getPlugins()
      .filter((manifest) => !getImplementationClass().pluginFailures.has(manifest.pluginDirectory))
      .map((manifest) => manifest.pluginDirectory);
    getImplementationClass().writeBootGuard(active);
    // A dev watcher or operator may stop the process during migrations or app.init().
    // That is an intentional shutdown, not evidence that every plugin crashed.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = () => {
        getImplementationClass().clearBootGuard();
        // Before Nest registers shutdown hooks, removing our listener restores
        // Node's normal signal termination. Once Nest is listening, let it close.
        if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
      };
      getImplementationClass().bootGuardSignalHandlers[signal] = handler;
      process.once(signal, handler);
    }
  }

  /**
   * Records the error that prevented the guarded startup from completing so the
   * next process can show the actionable cause rather than a generic warning.
   */
  public static recordBootFailure(error: unknown): void {
    const active = getImplementationClass().readBootGuard();
    if (active.length === 0) return;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const affected = active.filter((pluginDirectory) =>
      stack.includes(join(getImplementationClass().PLUGIN_PATH, pluginDirectory)),
    );
    if (affected.length === 0) {
      getImplementationClass().logger.error(
        'Could not attribute the startup failure to a plugin; no plugins were quarantined.',
      );
      return;
    }

    for (const pluginDirectory of affected) {
      getImplementationClass().pluginFailures.set(pluginDirectory, { pluginDirectory, message });
    }
    getImplementationClass().writeFailures([...getImplementationClass().pluginFailures.values()]);
  }

  public static clearBootGuard(): void {
    getImplementationClass().removeBootGuardSignalHandlers();
    const path = join(getImplementationClass().PLUGIN_PATH, PLUGIN_BOOT_GUARD_FILE);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  protected static removeBootGuardSignalHandlers(): void {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = getImplementationClass().bootGuardSignalHandlers[signal];
      if (handler) process.removeListener(signal, handler);
    }
    getImplementationClass().bootGuardSignalHandlers = {};
  }

  /**
   * Persist a failed plugin outside its package. A subsequent process must never
   * retry code which already prevented the host from starting.
   */
  public static quarantinePlugin(manifest: LoadedPluginManifest, error: Error): void {
    const key = `${manifest.name}@${manifest.version}`;
    getImplementationClass().setPluginLoadError(key, error);
    try {
      getImplementationClass().quarantinePluginDirectory(manifest.pluginDirectory, error);
    } catch (persistenceError) {
      getImplementationClass().logger.error(`Failed to persist quarantine for ${key}`, persistenceError as Error);
    }
  }

  public static quarantinePluginDirectory(pluginDirectory: string, error: Error): void {
    getImplementationClass().pluginFailures.set(pluginDirectory, { pluginDirectory, message: error.message });
    getImplementationClass().writeFailures([...getImplementationClass().pluginFailures.values()]);
  }

  public static pluginQuarantineError(pluginDirectory: string): string | undefined {
    return getImplementationClass().pluginFailures.get(pluginDirectory)?.message;
  }

  public static clearPluginQuarantine(pluginDirectory: string): void {
    const failure = getImplementationClass().pluginFailures.get(pluginDirectory);
    if (!failure) return;

    getImplementationClass().pluginFailures.delete(pluginDirectory);
    try {
      getImplementationClass().writeFailures([...getImplementationClass().pluginFailures.values()]);
    } catch (error) {
      getImplementationClass().pluginFailures.set(pluginDirectory, failure);
      throw error;
    }
  }

  protected static readFailures(): PluginFailure[] {
    return getImplementationClass().readJsonFile<PluginFailure[]>(PLUGIN_FAILURES_FILE, []);
  }

  protected static writeFailures(failures: PluginFailure[]): void {
    getImplementationClass().writeJsonFile(PLUGIN_FAILURES_FILE, failures);
  }

  protected static readBootGuard(): string[] {
    return getImplementationClass().readJsonFile<string[]>(PLUGIN_BOOT_GUARD_FILE, []);
  }

  protected static writeBootGuard(pluginDirectories: string[]): void {
    getImplementationClass().writeJsonFile(PLUGIN_BOOT_GUARD_FILE, pluginDirectories);
  }

  protected static readJsonFile<T>(name: string, fallback: T): T {
    try {
      const value: unknown = JSON.parse(readFileSync(join(getImplementationClass().PLUGIN_PATH, name), 'utf8'));
      return Array.isArray(fallback) && !Array.isArray(value) ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  protected static writeJsonFile(name: string, value: unknown): void {
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
