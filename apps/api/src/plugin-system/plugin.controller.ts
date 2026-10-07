import { Controller, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { installInheritedMethods } from '../common/inherited-implementation';
import { NpmPluginService } from './npm-plugin.service';
import { PluginLifecycleAuditImplementation } from './plugin-lifecycle-audit';
import { PluginService } from './plugin.service';

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController extends PluginLifecycleAuditImplementation {
  protected readonly logger = new Logger(PluginController.name);

  constructor(
    protected readonly pluginService: PluginService,
    protected readonly npmPluginService: NpmPluginService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  // Also add support for loading the index.js file
}
installInheritedMethods(PluginController, [
  'listRegistries',
  'addRegistry',
  'testRegistry',
  'removeRegistry',
  'packageMetadata',
  'packageVersions',
  'searchMarketplace',
  'marketplacePackage',
  'dependencyPlan',
  'removalPlan',
  'removePackageGraph',
  'installPackage',
  'installPackageSpec',
  'removeInstalledPackage',
  'installedPackages',
  'updatePolicy',
  'setUpdatePolicy',
  'checkAllInstalledPackages',
  'checkInstalledPackage',
  'updateInstalledPackageSpec',
  'updateInstalledPackageOverride',
  'updateInstalledPackagePolicy',
  'installedPackageVersions',
  'replaceInstalledPackage',
  'getAllPlugins',
  'getPluginSystemStatus',
  'retryPlugin',
  'getFrontendPluginFile',
  'uploadPlugin',
  'deletePlugin',
  'installWithAudit',
  'lifecycleDetails',
  'recordPackage',
  'record',
]);
