import { BadRequestException } from '@nestjs/common';
import { rm } from 'fs/promises';
import { NpmPluginInstallPreparationImplementation } from './npm-plugin-install-preparation';
import {
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PackageVersion,
  Registry,
} from './npm-plugin.service.feature-definitions';
import { orderPluginDependencies } from './plugin-dependencies';
import { PluginService } from './plugin.service';
export abstract class NpmPluginInstallTransactionImplementation extends NpmPluginInstallPreparationImplementation {
  protected async installFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions: string[] = [],
    requestedSpec = version,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
    audit?: NpmPluginAuditState,
  ): Promise<InstalledNpmPlugin> {
    const { installed, source, staging } = await this.prepareInstallFromRegistry(
      name,
      version,
      registry,
      replacing,
      approvedPermissionAdditions,
      requestedSpec,
      resolvedMetadata,
      audit,
    );
    try {
      // Activation and its state update must commit together so a rollback cannot
      // remove another install's target or overwrite its state entry.
      return await this.mutateInstalls(async () => {
        if (!replacing && this.listInstalled().some((plugin) => plugin.name === name)) {
          throw new BadRequestException('Package is already installed; use the replacement endpoint');
        }
        orderPluginDependencies([...this.listInstalled().filter((plugin) => plugin.name !== name), installed]);
        if (replacing && this.installed(name).version !== replacing.version)
          throw new BadRequestException('Installed version changed; review again');
        if (audit) audit.activationOutcome = 'failed';
        const activation = await this.activate(source, name, audit);
        // Do not expose replacement code as active until its prior quarantine has
        // been removed. If that cleanup fails, this state remains safely disabled.
        const pendingActivation: InstalledNpmPlugin = {
          ...installed,
          state: 'quarantined',
          lastError: 'Plugin activation is pending quarantine cleanup.',
        };
        try {
          await this.writeState(pendingActivation, this.pendingAudit(audit));
        } catch (error) {
          await this.rollbackForAudit(activation, audit);
          throw error;
        }
        try {
          PluginService.clearPluginQuarantine(installed.installPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const quarantined = {
            ...pendingActivation,
            lastError: `Plugin remains quarantined because quarantine cleanup failed: ${message}`,
          };
          this.logger.error(`Failed to clear quarantine for installed package ${name}`, error);
          try {
            await this.writeState(quarantined);
          } catch (stateError) {
            // The pending state was persisted before cleanup, so a later write
            // failure cannot make a quarantined package appear active.
            this.logger.error(`Failed to record quarantine cleanup failure for ${name}`, stateError);
          }
          if (audit) Object.assign(audit, { activationOutcome: 'quarantined', restartRequested: 1 });
          if (!audit?.context) new PluginService().requestRestart();
          return quarantined;
        }
        try {
          await this.writeState(installed, this.pendingAudit(audit));
        } catch (error) {
          // Discovery uses the npm record to find this installation, so restore
          // the real quarantine before returning this failed activation.
          this.logger.error(`Failed to activate installed package ${name}`, error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          try {
            PluginService.quarantinePluginDirectory(
              installed.installPath,
              new Error(`Plugin activation could not be persisted: ${message}`),
            );
          } catch (quarantineError) {
            this.logger.error(`Failed to quarantine installed package ${name}`, quarantineError);
            try {
              await this.rollbackForAudit(activation, audit);
            } catch (rollbackError) {
              this.logger.error(`Failed to roll back installed package ${name}`, rollbackError);
              try {
                await this.isolateActivation(activation.target);
                // Removing the failed package makes the original backup eligible
                // for restoration. Do not restore its active record until this
                // retry has put the backup back at the discovery target.
                await this.rollbackForAudit(activation, audit);
              } catch (isolationError) {
                throw new AggregateError(
                  [error, quarantineError, rollbackError, isolationError],
                  `Failed to safely activate ${name}`,
                );
              }
            }
            try {
              if (replacing) await this.writeState(replacing, null);
              else await this.writeStateWithout(name);
            } catch (stateError) {
              throw new AggregateError(
                [error, quarantineError, stateError],
                `Failed to restore installation state for ${name}`,
              );
            }
          }
          throw error;
        }
        try {
          await this.removeBackup(activation.backup);
        } catch (error) {
          this.logger.error(`Failed to remove backup for ${name}`, error);
        }
        // Host migrations and runtime activation happen after restart, not during download.
        if (audit)
          Object.assign(audit, {
            activationOutcome: 'restart-requested',
            migrationOutcome: 'pending-restart',
            restartRequested: 1,
          });
        if (!audit?.context) new PluginService().requestRestart();
        return installed;
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}
