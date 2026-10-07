import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { NpmPluginStatePersistenceImplementation } from './npm-plugin-state-persistence';
import { PluginClassificationService } from './plugin-classification.service';

@Injectable()
export class NpmPluginService
  extends NpmPluginStatePersistenceImplementation
  implements OnModuleInit, OnApplicationBootstrap
{
  protected readonly logger = new Logger(NpmPluginService.name);
  protected registryMutation = Promise.resolve();
  protected installMutation = Promise.resolve();

  constructor(
    protected readonly settings: SettingsStoreService,
    @Optional() classification?: PluginClassificationService,
    @Optional() protected readonly audit?: AuditService,
  ) {
    super();
    this.classification = classification ?? new PluginClassificationService();
  }

  protected readonly classification: PluginClassificationService;
}

export {
  DEFAULT_PLUGIN_UPDATE_POLICY,
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  MAX_CONFIGURED_REGISTRIES,
  NpmPluginAuditState,
  PluginInstallPlan,
  PluginUpdatePolicy,
  StoredRegistry,
} from './npm-plugin.service.feature-definitions';
