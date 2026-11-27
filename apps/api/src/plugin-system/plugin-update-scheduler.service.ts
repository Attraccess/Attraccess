import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { currentPluginUpdateWindow, PluginUpdateWindow } from '@attraccess/shared';

import { InstalledNpmPlugin, NpmPluginService } from './npm-plugin.service';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginService } from './plugin.service';

/** How old an update check may get before the host asks the registry again. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** How long the host leaves a version alone after installing it automatically failed. A newer version is not held back. */
export const FAILED_UPDATE_RETRY_MS = 24 * 60 * 60 * 1000;
/** An install starts only while this much of the window is left, or half of a window shorter than twice this. */
export const INSTALL_TIME_RESERVE_MS = 2 * 60 * 1000;

/**
 * Looks for newer versions of installed npm plugins, and installs them only once a plugin manager switched automatic
 * updates on, only inside the scheduled windows. Every minute it re-checks the plugins whose last check is stale (and
 * all of them once a window opens). Updates go through the same path as a manual replacement, without approving
 * anything, and the API restarts once afterwards, also only inside a window.
 */
@Injectable()
export class PluginUpdateScheduler {
  private readonly logger = new Logger(PluginUpdateScheduler.name);
  private running = false;
  /** Updates are on disk and wait for a restart that is only allowed inside a window. */
  private restartDue = false;
  private restartRequested = false;

  constructor(
    private readonly npmPlugins: NpmPluginService,
    private readonly administration: PluginAdministrationService,
    private readonly pluginService: PluginService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error('Plugin update run failed', error);
    }
  }

  /** One pass. A pass that is still running, or a requested restart, makes further passes do nothing. */
  async run(): Promise<void> {
    if (this.running || this.restartRequested) return;
    this.running = true;
    try {
      if (this.npmPlugins.listInstalled().length === 0 && !this.restartDue) return;
      const policy = await this.npmPlugins.getUpdatePolicy();
      if (!policy.checksEnabled) return;
      await this.checkStale((await this.openWindow())?.start ?? null);
      await this.installAvailable();
      await this.restartIfDue();
    } finally {
      this.running = false;
    }
  }

  /**
   * The window in which the host may install and restart right now, or null. Read from the stored policy every time:
   * downloads take a while, and the window may close or a plugin manager may switch automatic updates off meanwhile.
   */
  private async openWindow(): Promise<PluginUpdateWindow | null> {
    const { checksEnabled, automaticUpdates, schedule } = await this.npmPlugins.getUpdatePolicy();
    return checksEnabled && automaticUpdates ? currentPluginUpdateWindow(schedule, new Date()) : null;
  }

  private async mayStartInstall(): Promise<boolean> {
    const window = await this.openWindow();
    if (!window) return false;
    const reserve = Math.min(INSTALL_TIME_RESERVE_MS, (window.end.getTime() - window.start.getTime()) / 2);
    return window.end.getTime() - Date.now() >= reserve;
  }

  private async checkStale(windowStart: Date | null): Promise<void> {
    for (const plugin of this.npmPlugins.listInstalled()) {
      const checkedAt = plugin.updateCheck ? Date.parse(plugin.updateCheck.checkedAt) : 0;
      const stale = Date.now() - checkedAt >= UPDATE_CHECK_INTERVAL_MS;
      if (!stale && !(windowStart && checkedAt < windowStart.getTime())) continue;
      await this.attempt(`check ${plugin.name} for updates`, () => this.npmPlugins.checkInstalled(plugin.name));
    }
  }

  private async installAvailable(): Promise<void> {
    for (const { name } of this.npmPlugins.listInstalled().filter((plugin) => this.offered(plugin))) {
      if (!(await this.mayStartInstall())) return;
      await this.attempt(`update ${name}`, () => this.install(name));
    }
  }

  private async install(name: string): Promise<void> {
    // The offer may be an hour old: check again so the current policy, plugin settings and registry decide.
    const plugin = await this.npmPlugins.checkInstalled(name);
    const version = this.offered(plugin);
    if (!version || !(await this.mayStartInstall())) return;
    this.logger.log(`Updating ${name} from ${plugin.version} to ${version} in the update window.`);
    try {
      await this.administration.applyAutomaticUpdate(name, version, () => {
        this.restartDue = true;
      });
    } catch (error) {
      await this.npmPlugins.recordAutoUpdateFailure(name, version, new Date());
      throw error;
    }
  }

  private async restartIfDue(): Promise<void> {
    if (!this.restartDue) return;
    if (!(await this.openWindow())) {
      this.logger.debug('Updated plugins wait for the next update window to restart.');
      return;
    }
    this.restartDue = false;
    this.restartRequested = true;
    this.logger.log('Restarting to activate the updated plugins.');
    this.pluginService.requestRestart();
  }

  /** The version to install now, if an update is offered and it did not just fail. */
  private offered(plugin: InstalledNpmPlugin): string | null {
    const candidate = plugin.updateCheck?.state === 'available' ? plugin.updateCheck.candidate : null;
    const failure = plugin.autoUpdateFailure;
    const heldBack =
      failure?.version === candidate && Date.now() - Date.parse(failure.failedAt) < FAILED_UPDATE_RETRY_MS;
    return candidate && !heldBack ? candidate : null;
  }

  /** One plugin's failure must not keep the others from being checked or updated. */
  private async attempt(what: string, operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.logger.warn(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
