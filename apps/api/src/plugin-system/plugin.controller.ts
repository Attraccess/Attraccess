import { recordAdministrationSafely, auditSubjectKeyId } from '../audit/audit-administration-policy';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { PluginService } from './plugin.service';
import { PluginModule } from './plugin.module';
import { createReadStream, existsSync } from 'fs';
import { ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoadedPluginManifest } from './plugin.manifest';
import { join } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUpload } from '../common/types/file-upload.types';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../audit/audit.service';
import { UploadPluginDto } from './dto/uploadPlugin.dto';
import { InstalledNpmPlugin, NpmPluginAuditState, NpmPluginService } from './npm-plugin.service';
import { safeAuditOrigin, safeRequestedSpec } from '../audit/audit-administration-policy';
import { randomUUID } from 'crypto';
import { PluginSystemStatusDto } from './dto/plugin-system-status.dto';
import { RetryPluginResponseDto } from './dto/retry-plugin-response.dto';
import {
  AddPluginRegistryDto,
  InstallPluginDto,
  ReplaceInstalledPluginDto,
  UpdateInstalledPluginPolicyDto,
} from './dto/npm-plugin-request.dto';

const PLUGIN_SYSTEM_INSTANCE_ID = randomUUID();

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

  constructor(
    private readonly pluginService: PluginService,
    private readonly npmPluginService: NpmPluginService,
    private readonly audit: AuditService,
  ) {}

  @Get('registries')
  @Auth('system.plugins.manage')
  listRegistries() {
    return this.npmPluginService.listRegistries();
  }

  @Post('registries')
  @Auth('system.plugins.manage')
  addRegistry(@Body() body: AddPluginRegistryDto, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.addRegistry(body).then(async (registry) => {
      await this.record(req, 'plugin.registry_added', auditSubjectKeyId(registry.id), 'plugin-registry', {
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
    await this.record(req, 'plugin.registry_tested', auditSubjectKeyId(registryId), 'plugin-registry', { registryId });
    return { ok: true };
  }

  @Delete('registries/:registryId')
  @Auth('system.plugins.manage')
  removeRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.removeRegistry(registryId).then(async () => {
      await this.record(req, 'plugin.registry_removed', auditSubjectKeyId(registryId), 'plugin-registry', {
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

  @Post('npm/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  installPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: InstallPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.installWithAudit(req, 'plugin.installed', packageName, version, (state) =>
      this.npmPluginService.install(packageName, version, body.registryId, state),
    );
  }

  @Post('npm/:packageName')
  @Auth('system.plugins.manage')
  installPackageSpec(
    @Param('packageName') packageName: string,
    @Body('spec') spec = 'latest',
    @Body('registryId') registryId?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.installWithAudit(req, 'plugin.installed', packageName, spec, (state) =>
      this.npmPluginService.install(packageName, spec, registryId, state),
    );
  }

  @Delete('installed/:packageName')
  @Auth('system.plugins.manage')
  async removeInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    const installed = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(req));
    if (installed) await this.recordPackage(req, 'plugin.removed', installed);
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
      await this.record(req, 'plugin.update_policy_updated', 1, 'plugin-policy', {
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
      for (const plugin of installed) await this.recordPackage(req, 'plugin.checked', plugin);
      return installed;
    });
  }

  @Post('installed/:packageName/check')
  @Auth('system.plugins.manage')
  checkInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.checkInstalled(packageName).then(async (installed) => {
      await this.recordPackage(req, 'plugin.checked', installed);
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
      await this.recordPackage(req, 'plugin.spec_updated', installed);
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
      await this.recordPackage(req, 'plugin.update_override_updated', installed);
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
        await this.recordPackage(req, 'plugin.package_policy_updated', installed);
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
    return this.installWithAudit(
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
    await this.record(req, 'plugin.retry_requested', auditSubjectKeyId(plugin.name), 'plugin-package', {
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
    await this.record(req, 'plugin.zip_uploaded', auditSubjectKeyId(plugin.name), 'plugin-package', {
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
      await this.recordPackage(req, 'plugin.removed', installed);
      if (req) this.pluginService.requestRestart();
      return;
    }
    await this.pluginService.deletePlugin(pluginId, Boolean(req));
    await this.record(req, 'plugin.zip_deleted', auditSubjectKeyId(plugin?.name ?? pluginId), 'plugin-package', {
      pluginId,
      restartRequested: 1,
    });
    if (req) this.pluginService.requestRestart();
  }

  private async installWithAudit(
    req: AuthenticatedRequest | undefined,
    action: string,
    packageName: string,
    requestedSpec: string,
    operation: (state: NpmPluginAuditState) => Promise<InstalledNpmPlugin>,
    before?: InstalledNpmPlugin,
  ) {
    const state: NpmPluginAuditState = {
      ...(req
        ? {
            context: {
              operationId: randomUUID(),
              actorId: req.user.id,
              authenticationMethod: req.user.authenticationMethod,
              apiTokenId: req.user.apiTokenId,
            },
          }
        : {}),
      packageName,
      requestedSpec: safeRequestedSpec(requestedSpec),
      ...(before ? { oldVersion: before.version } : {}),
      integrityResult: 'not-checked',
      provenanceResult: 'not-verified',
      migrationOutcome: 'not-run',
      activationOutcome: 'not-attempted',
      restartRequested: 0,
      rollbackOutcome: 'not-needed',
    };
    try {
      const installed = await operation(state);
      if (req)
        await this.record(
          req,
          action,
          auditSubjectKeyId(packageName),
          'plugin-package',
          {
            ...this.lifecycleDetails(state),
            ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
          },
          installed.state === 'quarantined' ? 'failed' : 'succeeded',
          state.context?.operationId,
        );
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
      return installed;
    } catch (error) {
      if (req)
        await this.record(
          req,
          action,
          auditSubjectKeyId(packageName),
          'plugin-package',
          {
            ...this.lifecycleDetails(state),
            ...(state.registryUrl ? { registryUrl: safeAuditOrigin(state.registryUrl) } : {}),
          },
          'failed',
          state.context?.operationId,
        );
      if (state.context && state.restartRequested) this.pluginService.requestRestart();
      throw error;
    }
  }

  private lifecycleDetails(state: NpmPluginAuditState): Record<string, string | number> {
    const { context, ...details } = state;
    void context;
    return details;
  }

  private async recordPackage(req: AuthenticatedRequest, action: string, installed: InstalledNpmPlugin) {
    if (!req?.user) return;
    const removed = action === 'plugin.removed';
    await this.record(req, action, auditSubjectKeyId(installed.name), 'plugin-package', {
      packageName: installed.name,
      ...(removed ? { oldVersion: installed.version } : { newVersion: installed.version }),
      requestedSpec: safeRequestedSpec(installed.requestedSpec),
      registryId: installed.registryId,
      registryUrl: safeAuditOrigin(installed.registryUrl),
      updateOverride: installed.updateOverride ?? 'inherit',
      ...(removed
        ? {
            activationOutcome: 'removed',
            restartRequested: 1,
            migrationOutcome: 'not-applicable',
            rollbackOutcome: 'not-needed',
            permissionAdditions: '[]',
            permissionRemovals: JSON.stringify(installed.permissions),
          }
        : {}),
      ...(installed.updateCheck
        ? { candidate: installed.updateCheck.candidate ?? '', checkState: installed.updateCheck.state }
        : {}),
    });
  }

  private async record(
    req: AuthenticatedRequest,
    action: string,
    subjectId: number,
    subjectType: string,
    details: Record<string, string | number>,
    outcome: 'succeeded' | 'failed' = 'succeeded',
    operationId?: string,
  ) {
    if (!req?.user) return;
    await recordAdministrationSafely(this.audit, {
      action,
      actorId: req.user.id,
      authenticationMethod: req.user.authenticationMethod,
      apiTokenId: req.user.apiTokenId,
      subjectType,
      subjectId,
      details,
      outcome,
      operationId,
    });
  }
}
