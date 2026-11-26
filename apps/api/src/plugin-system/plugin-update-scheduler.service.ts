import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { maintenanceWindowStart } from './npm/maintenance-window';
import { InstalledNpmPlugin, NpmPluginService } from './npm-plugin.service';
import { PluginAdministrationService } from './plugin-administration.service';
import { PluginService } from './plugin.service';

/** How old an update check may get before the host asks the registry again. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** How long the host leaves a version alone after installing it automatically failed. A newer version is not held back. */
export const FAILED_UPDATE_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps installed npm plugins up to date. Every minute it re-checks the plugins whose last check is stale (and all of
 * them once a maintenance window opens). Inside the window it installs the offered updates through the same path as a
 * manual replacement, without approving anything, and restarts the API once afterwards.
 */
@Injectable()
export class PluginUpdateScheduler {
  private readonly logger = new Logger(PluginUpdateScheduler.name);
  private running = false;
  private restartRequested = false;

  constructor(
    private readonly npmPlugins: NpmPluginService,
    private readonly administration: PluginAdministrationService,
    private readonly pluginService: PluginService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (error) {
      this.logger.error('Plugin update run failed', error);
    }
  }

  /** One pass at `now`. A pass that is still running, or a pending restart, makes further passes do nothing. */
  async run(now: Date): Promise<void> {
    if (this.running || this.restartRequested) return;
    this.running = true;
    try {
      if (this.npmPlugins.listInstalled().length === 0) return;
      const policy = await this.npmPlugins.getUpdatePolicy();
      if (!policy.checksEnabled) return;
      const windowStart = maintenanceWindowStart(policy.maintenanceWindow, now);
      await this.checkStale(now, windowStart);
      if (windowStart) await this.installAvailable(now);
    } finally {
      this.running = false;
    }
  }

  private async checkStale(now: Date, windowStart: Date | null): Promise<void> {
    for (const plugin of this.npmPlugins.listInstalled()) {
      const checkedAt = plugin.updateCheck ? Date.parse(plugin.updateCheck.checkedAt) : 0;
      const stale = now.getTime() - checkedAt >= UPDATE_CHECK_INTERVAL_MS;
      if (!stale && !(windowStart && checkedAt < windowStart.getTime())) continue;
      await this.attempt(`check ${plugin.name} for updates`, () => this.npmPlugins.checkInstalled(plugin.name));
    }
  }

  private async installAvailable(now: Date): Promise<void> {
    let restart = false;
    for (const { name } of this.npmPlugins.listInstalled().filter((plugin) => this.offered(plugin, now))) {
      await this.attempt(`update ${name}`, () =>
        this.install(name, now, () => {
          restart = true;
        }),
      );
    }
    if (!restart) return;
    this.restartRequested = true;
    this.logger.log('Restarting to activate the updated plugins.');
    this.pluginService.requestRestart();
  }

  private async install(name: string, now: Date, onRestartRequired: () => void): Promise<void> {
    // The offer may be an hour old: check again so the current policy, plugin settings and registry decide.
    const plugin = await this.npmPlugins.checkInstalled(name);
    const version = this.offered(plugin, now);
    if (!version) return;
    this.logger.log(`Updating ${name} from ${plugin.version} to ${version} in the maintenance window.`);
    try {
      await this.administration.applyAutomaticUpdate(name, version, onRestartRequired);
    } catch (error) {
      await this.npmPlugins.recordAutoUpdateFailure(name, version, now);
      throw error;
    }
  }

  /** The version to install now, if an update is offered and it did not just fail. */
  private offered(plugin: InstalledNpmPlugin, now: Date): string | null {
    const candidate = plugin.updateCheck?.state === 'available' ? plugin.updateCheck.candidate : null;
    const failure = plugin.autoUpdateFailure;
    const heldBack =
      failure?.version === candidate && now.getTime() - Date.parse(failure.failedAt) < FAILED_UPDATE_RETRY_MS;
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
