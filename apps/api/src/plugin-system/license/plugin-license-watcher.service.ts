import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { LicenseService } from '../../license/license.service';
import { LICENSE_KEY_CHANGED_EVENT } from '../../settings/constants';
import { arePluginsDisabled } from '../plugins-disabled';
import { PluginService } from '../plugin.service';
import type { PluginLicenseSnapshot } from './plugin-license';

/**
 * Plugin load decisions are made once at startup. After the license key changed, this restarts the API exactly when
 * that would change the decision of at least one license-gated plugin. There is no periodic re-check (expiry is
 * picked up by the next startup).
 */
@Injectable()
export class PluginLicenseWatcher {
  private readonly logger = new Logger(PluginLicenseWatcher.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly pluginService: PluginService,
  ) {}

  @OnEvent(LICENSE_KEY_CHANGED_EVENT)
  async onLicenseKeyChanged(): Promise<void> {
    if (arePluginsDisabled()) return;

    let snapshot: PluginLicenseSnapshot;
    try {
      const data = await this.moduleRef.get(LicenseService, { strict: false }).getLicenseData();
      snapshot = { valid: data.valid, modules: data.valid ? data.modules : [] };
      // AppModule.onModuleInit aborts startup for a stored key that does not verify. Restarting into that would take
      // the API down, so keep running and let the admin correct the key; the next startup applies it. A removed key
      // is different: startup skips the check, so a restart is safe and unloads the plugins that need a license.
      if (!data.valid && data.reason !== 'LICENSE_KEY_NOT_CONFIGURED') {
        this.logger.warn(`The new license key is not valid (${data.reason ?? 'unknown reason'}); not restarting.`);
        return;
      }
    } catch (error) {
      this.logger.warn(`Could not verify the new license key (${String(error)}); not restarting.`);
      return;
    }

    if (PluginService.licenseDecisionChanges(snapshot)) {
      this.logger.log('The license change affects which plugins load; restarting.');
      this.pluginService.requestRestart();
    }
  }
}
