import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import { NpmPluginInstallPlanImplementation } from './npm-plugin-install-plan';
import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PluginInstallPlan,
  PreparedPlugin,
  Registry,
  TRANSACTION_FILE,
  backupDirectoryName,
  readInstalledNpmPlugins,
  samePermissions,
} from './npm-plugin.service.feature-definitions';
import { PluginService } from './plugin.service';
export abstract class NpmPluginInstallGraphImplementation extends NpmPluginInstallPlanImplementation {
  protected async installGraph(
    plan: PluginInstallPlan,
    registry: Registry,
    requestedSpec: string,
    replacing?: InstalledNpmPlugin,
    approvedPermissions: string[] = [],
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    if (planToken !== plan.token)
      throw new BadRequestException(
        'Dependency plan changed or requires confirmation. Review the plugin versions and permissions again.',
      );
    const before = JSON.stringify(readInstalledNpmPlugins());
    if (createHash('sha256').update(before).digest('hex') !== plan.stateHash)
      throw new BadRequestException('Installed plugins changed. Review the dependency plan again.');
    const prepared: PreparedPlugin[] = [];
    try {
      for (const plugin of plan.plugins.filter((plugin) => plugin.action !== 'reuse')) {
        const item = await this.prepareInstallFromRegistry(
          plugin.name,
          plugin.version,
          registry,
          plugin.action === 'replace' ? replacing : undefined,
          plugin.action === 'replace' ? approvedPermissions : [],
          plugin.name === plan.root ? requestedSpec : plugin.version,
          undefined,
          plugin.name === audit?.packageName ? audit : undefined,
        );
        prepared.push(item);
        if (
          JSON.stringify(item.installed.dependencies ?? []) !== JSON.stringify(plugin.dependencies) ||
          !samePermissions(item.installed.permissions, plugin.permissions) ||
          item.installed.integrity !== plugin.integrity ||
          item.installed.classification !== plugin.classification
        )
          throw new BadRequestException(`Package ${plugin.name} does not match its confirmed dependency plan`);
      }
      return await this.mutateInstalls(async () => {
        if (JSON.stringify(readInstalledNpmPlugins()) !== before)
          throw new BadRequestException('Installed plugins changed. Review the dependency plan again.');
        const activations: Array<{ target: string; backup: string }> = [];
        const quarantines = prepared.map(({ installed }) => ({
          directory: installed.installPath,
          error: PluginService.pluginQuarantineError(installed.installPath),
        }));
        const names = new Set(prepared.map(({ installed }) => installed.name));
        const records = [
          ...readInstalledNpmPlugins().filter(({ name }) => !names.has(name)),
          ...prepared.map(({ installed }) => ({
            ...installed,
            ...(installed.name === audit?.packageName && this.pendingAudit(audit)
              ? { pendingAudit: this.pendingAudit(audit) }
              : {}),
          })),
        ];
        const moves = prepared.map(({ installed }) => ({
          installPath: installed.installPath,
          backupName: backupDirectoryName(installed.installPath),
          hadTarget: existsSync(join(PluginService.PLUGIN_PATH, installed.installPath)),
          quarantineError: PluginService.pluginQuarantineError(installed.installPath),
        }));
        await this.writeTransaction(records, moves);
        try {
          for (const [index, item] of prepared.entries()) {
            activations.push(await this.activate(item.source, item.installed.name, audit, moves[index].backupName));
            PluginService.clearPluginQuarantine(item.installed.installPath);
          }
          await this.writeRecords(records);
        } catch (error) {
          for (const activation of activations.reverse()) await this.rollbackForAudit(activation, audit);
          for (const quarantine of quarantines)
            if (quarantine.error)
              PluginService.quarantinePluginDirectory(quarantine.directory, new Error(quarantine.error));
          await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
          throw error;
        }
        // State is the commit point; startup can finish journal cleanup after a crash.
        try {
          await rm(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE), { force: true });
        } catch (error) {
          this.logger.error('Failed to clear plugin transaction journal', error);
        }
        for (const { backup } of activations) {
          try {
            await this.removeBackup(backup);
          } catch (error) {
            this.logger.error('Failed to remove plugin backup', error);
          }
        }
        if (audit)
          Object.assign(audit, {
            activationOutcome: 'restart-requested',
            migrationOutcome: 'pending-restart',
            restartRequested: 1,
          });
        if (!audit?.context) new PluginService().requestRestart();
        return prepared.find(({ installed }) => installed.name === plan.root).installed;
      });
    } finally {
      for (const { staging } of prepared) await rm(staging, { recursive: true, force: true });
    }
  }

  async install(
    name: string,
    spec: string,
    registryId?: string,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    if (this.listInstalled().some((plugin) => plugin.name === name)) {
      throw new BadRequestException('Package is already installed; use the replacement endpoint');
    }
    const registry = await this.registry(registryId);
    const { version, metadata } = await this.resolveVersion(name, spec, registry);
    const plan = await this.installPlan(name, version, registry.id);
    if (plan.plugins.length > 1) return this.installGraph(plan, registry, spec, undefined, [], audit, planToken);
    return this.installFromRegistry(name, version, registry, undefined, [], spec, metadata, audit);
  }
}
