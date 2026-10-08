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
} from '@nestjs/common';

import { ApiTags, ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AuditService } from '../audit/audit.service';

import { installInheritedMethods } from '../common/inherited-implementation';

import { NpmPluginService, InstalledNpmPlugin, NpmPluginAuditState } from './npm-plugin.service';

import { PluginService } from './plugin.service';

import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';

import { randomUUID } from 'crypto';

import {
  auditSubjectKeyId,
  recordAdministrationSafely,
  safeAuditOrigin,
  safeRequestedSpec,
} from '../audit/policies/administration';

import { FileInterceptor } from '@nestjs/platform-express';

import { createReadStream, existsSync } from 'fs';

import { join } from 'path';

import { FileUpload } from '../common/types/file-upload.types';

import { PluginSystemStatusDto } from './dto/plugin-system-status.dto';

import { RetryPluginResponseDto } from './dto/retry-plugin-response.dto';

import { UploadPluginDto } from './dto/uploadPlugin.dto';

import { PackageManagementRoutes } from './packages/package-management.routes';

import { PLUGIN_SYSTEM_INSTANCE_ID } from './packages/package-management.routes';

import { LoadedPluginManifest } from './plugin.manifest';

import { PluginModule } from './plugin.module';

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController extends PackageManagementRoutes {
  constructor(
    protected readonly pluginService: PluginService,
    protected readonly npmPluginService: NpmPluginService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  protected readonly logger = new Logger(PluginController.name);

  // Also add support for loading the index.js file

  protected async installWithAudit(
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

  protected lifecycleDetails(state: NpmPluginAuditState): Record<string, string | number> {
    const { context, ...details } = state;
    void context;
    return details;
  }

  protected async recordPackage(req: AuthenticatedRequest, action: string, installed: InstalledNpmPlugin) {
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

  protected async record(
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
