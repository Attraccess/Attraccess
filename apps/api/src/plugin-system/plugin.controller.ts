import {
  Controller,
  Logger,
  BadRequestException,
  Body,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';

import { ApiTags, ApiConsumes, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { AuditService } from '../audit/audit.service';

import { NpmPluginService } from './npm-plugin.service';

import { PluginService } from './plugin.service';

import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { auditSubjectKeyId, safeAuditOrigin } from '../audit/policies/administration';

import { FileInterceptor } from '@nestjs/platform-express';

import { createReadStream, existsSync } from 'fs';

import { join } from 'path';

import { FileUpload } from '../common/types/file-upload.types';

import { PluginSystemStatusDto } from './dto/plugin-system-status.dto';

import { RetryPluginResponseDto } from './dto/retry-plugin-response.dto';

import { UploadPluginDto } from './dto/uploadPlugin.dto';

import { PLUGIN_SYSTEM_INSTANCE_ID, PluginPackageAudit } from './packages/plugin-package-audit';

import { LoadedPluginManifest } from './plugin.manifest';

import { PluginModule } from './plugin.module';
import {
  AddPluginRegistryDto,
  RemoveInstalledPluginDto,
  InstallPluginDto,
  UpdateInstalledPluginPolicyDto,
  ReplaceInstalledPluginDto,
} from './dto/npm-plugin-request.dto';
import { PluginDependencyPlanDto, PluginRemovalItemDto } from './dto/plugin-dependency-plan.dto';

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController {
  private readonly packageAudit: PluginPackageAudit;

  constructor(
    private readonly pluginService: PluginService,
    private readonly npmPluginService: NpmPluginService,
    audit: AuditService,
  ) {
    this.packageAudit = new PluginPackageAudit(pluginService, audit);
  }

  private readonly logger = new Logger(PluginController.name);

  @Get('registries')
  @Auth('system.plugins.manage')
  listRegistries() {
    return this.npmPluginService.listRegistries();
  }

  @Post('registries')
  @Auth('system.plugins.manage')
  addRegistry(@Body() body: AddPluginRegistryDto, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.addRegistry(body).then(async (registry) => {
      await this.packageAudit.record(req, 'plugin.registry_added', auditSubjectKeyId(registry.id), 'plugin-registry', {
        registryId: registry.id,
        registryName: registry.name,
        registryUrl: safeAuditOrigin(registry.url),
      });
      return registry;
    });
  }

  @Post('registries/:registryId/test')
  @Auth('system.plugins.manage')
  async testRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    await this.npmPluginService.testRegistry(registryId);
    await this.packageAudit.record(req, 'plugin.registry_tested', auditSubjectKeyId(registryId), 'plugin-registry', {
      registryId,
    });
    return { ok: true };
  }

  @Delete('registries/:registryId')
  @Auth('system.plugins.manage')
  removeRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.removeRegistry(registryId).then(async () => {
      await this.packageAudit.record(req, 'plugin.registry_removed', auditSubjectKeyId(registryId), 'plugin-registry', {
        registryId,
      });
    });
  }

  @Get('npm/:packageName/metadata')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  packageMetadata(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.packageMetadata(packageName, registryId);
  }

  @Get('npm/:packageName/versions')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  packageVersions(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.packageVersions(packageName, registryId);
  }

  @Get('marketplace/search')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'registryId', required: false, type: String })
  searchMarketplace(@Query('query') query = '', @Query('registryId') registryId?: string) {
    return this.npmPluginService.searchMarketplace(query, registryId);
  }

  @Get('marketplace/:packageName')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  marketplacePackage(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.marketplacePackage(packageName, registryId);
  }

  @Get('npm/:packageName/plan')
  @ApiResponse({ status: 200, type: PluginDependencyPlanDto })
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'spec', required: false, type: String })
  @ApiQuery({ name: 'registryId', required: false, type: String })
  dependencyPlan(
    @Param('packageName') packageName: string,
    @Query('spec') spec = 'latest',
    @Query('registryId') registryId?: string,
  ) {
    return this.npmPluginService.installPlan(packageName, spec, registryId);
  }

  @Get('installed/:packageName/removal-plan')
  @ApiResponse({ status: 200, type: [PluginRemovalItemDto] })
  @Auth('system.plugins.manage')
  removalPlan(@Param('packageName') packageName: string) {
    return this.npmPluginService.removalPlan(packageName);
  }

  @Post('installed/:packageName/remove')
  @Auth('system.plugins.manage')
  async removePackageGraph(
    @Param('packageName') packageName: string,
    @Body() body: RemoveInstalledPluginDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const removing = this.npmPluginService.removalPlan(packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(req), body.approvedDependants ?? []);
    for (const plugin of removing) await this.packageAudit.recordPackage(req, 'plugin.removed', plugin);
    if (req) this.pluginService.requestRestart();
    return { ok: true };
  }

  @Post('npm/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  installPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: InstallPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.packageAudit.installWithAudit(req, 'plugin.installed', packageName, version, (state) =>
      this.npmPluginService.install(packageName, version, body.registryId, state, body.planToken),
    );
  }

  @Post('npm/:packageName')
  @Auth('system.plugins.manage')
  installPackageSpec(
    @Param('packageName') packageName: string,
    @Body('spec') spec = 'latest',
    @Body('registryId') registryId?: string,
    @Req() req?: AuthenticatedRequest,
    @Body('planToken') planToken?: string,
  ) {
    return this.packageAudit.installWithAudit(req, 'plugin.installed', packageName, spec, (state) =>
      this.npmPluginService.install(packageName, spec, registryId, state, planToken),
    );
  }

  @Delete('installed/:packageName')
  @Auth('system.plugins.manage')
  async removeInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    const installed = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(req));
    if (installed) await this.packageAudit.recordPackage(req, 'plugin.removed', installed);
    if (req) this.pluginService.requestRestart();
    return { ok: true };
  }

  @Get('installed')
  @Auth('system.plugins.manage')
  installedPackages() {
    return this.npmPluginService.listInstalled();
  }

  @Get('update-policy')
  @Auth('system.plugins.manage')
  updatePolicy() {
    return this.npmPluginService.getUpdatePolicy();
  }

  @Post('update-policy')
  @Auth('system.plugins.manage')
  setUpdatePolicy(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.setUpdatePolicy(body).then(async (policy) => {
      await this.packageAudit.record(req, 'plugin.update_policy_updated', 1, 'plugin-policy', {
        checksEnabled: policy.checksEnabled ? 1 : 0,
        updateMode: policy.mode,
        maintenanceStartMinute: policy.maintenanceWindow.startMinute,
        maintenanceDurationMinutes: policy.maintenanceWindow.durationMinutes,
        prerelease: policy.prerelease ? 1 : 0,
      });
      return policy;
    });
  }

  @Post('installed/check')
  @Auth('system.plugins.manage')
  checkAllInstalledPackages(@Req() req: AuthenticatedRequest) {
    return this.npmPluginService.checkAllInstalled().then(async (installed) => {
      for (const plugin of installed) await this.packageAudit.recordPackage(req, 'plugin.checked', plugin);
      return installed;
    });
  }

  @Post('installed/:packageName/check')
  @Auth('system.plugins.manage')
  checkInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.checkInstalled(packageName).then(async (installed) => {
      await this.packageAudit.recordPackage(req, 'plugin.checked', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/spec')
  @Auth('system.plugins.manage')
  updateInstalledPackageSpec(
    @Param('packageName') packageName: string,
    @Body('requestedSpec') requestedSpec: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService.updateRequestedSpec(packageName, requestedSpec).then(async (installed) => {
      await this.packageAudit.recordPackage(req, 'plugin.spec_updated', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/update-override')
  @Auth('system.plugins.manage')
  updateInstalledPackageOverride(
    @Param('packageName') packageName: string,
    @Body('updateOverride') updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService.updateOverride(packageName, updateOverride).then(async (installed) => {
      await this.packageAudit.recordPackage(req, 'plugin.update_override_updated', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/update-policy')
  @Auth('system.plugins.manage')
  updateInstalledPackagePolicy(
    @Param('packageName') packageName: string,
    @Body() body: UpdateInstalledPluginPolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService
      .updateVersionPolicy(packageName, body.requestedSpec, body.updateOverride)
      .then(async (installed) => {
        await this.packageAudit.recordPackage(req, 'plugin.package_policy_updated', installed);
        return installed;
      });
  }

  @Get('installed/:packageName/versions')
  @Auth('system.plugins.manage')
  installedPackageVersions(@Param('packageName') packageName: string) {
    return this.npmPluginService.installedVersionCandidates(packageName);
  }

  @Post('installed/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  replaceInstalledPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: ReplaceInstalledPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    const before = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    return this.packageAudit.installWithAudit(
      req,
      'plugin.replaced',
      packageName,
      before?.requestedSpec ?? version,
      (state) =>
        this.npmPluginService.replaceInstalled(
          packageName,
          version,
          body.approvedPermissionAdditions ?? [],
          body.approvedMajorVersion === true,
          state,
          body.planToken,
        ),
      before,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all plugins', operationId: 'getPlugins' })
  @ApiResponse({
    status: 200,
    description: 'The list of all plugins',
    type: [LoadedPluginManifest],
  })
  getAllPlugins() {
    return PluginService.getPluginsWithLoadStatus();
  }

  @Get('status')
  @Auth('system.plugins.manage')
  @ApiOperation({ summary: 'Get plugin system status', operationId: 'getPluginSystemStatus' })
  @ApiResponse({ status: 200, type: PluginSystemStatusDto })
  getPluginSystemStatus(): PluginSystemStatusDto {
    return { disabled: PluginModule.arePluginsDisabled(), instanceId: PLUGIN_SYSTEM_INSTANCE_ID };
  }

  @Post(':pluginId/retry')
  @Auth('system.plugins.manage')
  @ApiOperation({ summary: 'Retry a failed plugin on restart', operationId: 'retryPlugin' })
  @ApiResponse({ status: 201, type: RetryPluginResponseDto })
  async retryPlugin(
    @Param('pluginId') pluginId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RetryPluginResponseDto> {
    const plugin = PluginService.getManifestById(pluginId);
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }
    if (!PluginService.isPluginQuarantined(plugin)) {
      throw new BadRequestException('Plugin is not disabled');
    }

    PluginService.clearPluginQuarantine(plugin.pluginDirectory);
    await this.packageAudit.record(req, 'plugin.retry_requested', auditSubjectKeyId(plugin.name), 'plugin-package', {
      pluginId,
      restartRequested: 1,
    });
    this.pluginService.requestRestart();
    return { ok: true };
  }

  // Also add support for loading the index.js file
  @Get(':pluginName/frontend/module-federation/*filePath')
  @ApiOperation({ summary: 'Get any frontend plugin file', operationId: 'getFrontendPluginFile' })
  @ApiResponse({
    status: 200,
    description: 'The requested frontend plugin file',
    type: String,
  })
  getFrontendPluginFile(@Param('pluginName') pluginName: string, @Param('filePath') filePath?: string) {
    const plugins = PluginService.getPlugins();
    const plugin = plugins.find((plugin) => plugin.name === pluginName);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginName} not found`);
    }
    if (!plugin.main.frontend) {
      throw new NotFoundException(`Plugin ${pluginName} has no frontend assets`);
    }

    const fileName = join(...filePath.split(','));

    // Path should point to the requested file in the plugin directory
    const pluginDir = join(PluginService.PLUGIN_PATH, plugin.main.frontend.directory);
    const fullFilePath = join(pluginDir, fileName);

    if (!existsSync(fullFilePath)) {
      this.logger.warn(`Frontend file ${fullFilePath} not found for plugin ${pluginName}`);
      throw new NotFoundException(`Frontend file ${fileName} not found for plugin ${pluginName}`);
    }

    this.logger.log(`Serving frontend file ${fileName} for plugin ${pluginName} from ${fullFilePath}`);

    // stream the file — browsers enforce strict MIME checking for stylesheets
    const fileStream = createReadStream(fullFilePath);
    return new StreamableFile(fileStream, {
      type: fileName.endsWith('.css') ? 'text/css' : 'application/javascript',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Upload a new plugin', operationId: 'uploadPlugin' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('pluginZip'))
  @Auth('system.plugins.manage')
  async uploadPlugin(
    @UploadedFile() file: FileUpload,
    @Body() body: UploadPluginDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Uploading plugin ${file.originalname}`);
    const plugin = await this.pluginService.uploadPlugin(file, Boolean(req));
    await this.packageAudit.record(req, 'plugin.zip_uploaded', auditSubjectKeyId(plugin.name), 'plugin-package', {
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      restartRequested: 1,
    });
    if (req) this.pluginService.requestRestart();
    return plugin;
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Delete a plugin', operationId: 'deletePlugin' })
  @ApiResponse({
    status: 200,
    description: 'The plugin has been deleted',
  })
  @Auth('system.plugins.manage')
  async deletePlugin(@Param('pluginId') pluginId: string, @Req() req: AuthenticatedRequest) {
    const plugin = PluginService.getManifestById(pluginId);
    const installed =
      this.npmPluginService.findInstalledByPluginId(pluginId) ??
      (plugin
        ? this.npmPluginService.listInstalled().find(({ installPath }) => installPath === plugin.pluginDirectory)
        : undefined);
    if (installed) {
      await this.npmPluginService.removeInstalled(installed.name, Boolean(req));
      await this.packageAudit.recordPackage(req, 'plugin.removed', installed);
      if (req) this.pluginService.requestRestart();
      return;
    }
    await this.pluginService.deletePlugin(pluginId, Boolean(req));
    await this.packageAudit.record(
      req,
      'plugin.zip_deleted',
      auditSubjectKeyId(plugin?.name ?? pluginId),
      'plugin-package',
      {
        pluginId,
        restartRequested: 1,
      },
    );
    if (req) this.pluginService.requestRestart();
  }
}
