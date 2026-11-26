import {
  Controller,
  Logger,
  Body,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';

import { ApiTags, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { auditActorOf } from '../audit/recorder/audit-event';

import { NpmPluginService } from './npm-plugin.service';

import { PluginAdministrationService } from './plugin-administration.service';

import { PluginService } from './plugin.service';
import { isPluginRestartRequired } from './runtime/restart-required';
import { frontendAssetRoot } from './runtime/frontend-snapshots';

import { AuthenticatedRequest, Auth, NotAnMcpTool } from '@attraccess/plugins-backend-sdk';

import { randomUUID } from 'crypto';

import { FileInterceptor } from '@nestjs/platform-express';

import { createReadStream } from 'fs';
import { finished } from 'stream';
import { Response } from 'express';

import { FileUpload } from '../common/types/file-upload.types';

import { PluginSystemStatusDto } from './dto/plugin-system-status.dto';

import { RestartPluginSystemResponseDto } from './dto/restart-plugin-system-response.dto';

import { RetryPluginResponseDto } from './dto/retry-plugin-response.dto';

import { UploadPluginDto } from './dto/uploadPlugin.dto';

import { LoadedPluginManifest } from './plugin.manifest';

import { arePluginsDisabled } from './plugins-disabled';

import {
  frontendAssetSegments,
  isMissingFrontendAsset,
  openFrontendAsset,
  sanitizedPathPrefix,
} from './frontend-asset-path';
import {
  AddPluginRegistryDto,
  RemoveInstalledPluginDto,
  InstallPluginDto,
  UpdateInstalledPluginPolicyDto,
  ReplaceInstalledPluginDto,
} from './dto/npm-plugin-request.dto';
import { PluginDependencyPlanDto, PluginRemovalItemDto } from './dto/plugin-dependency-plan.dto';
import { PluginRegistryDto } from './dto/plugin-registry.dto';
import { MarketplacePluginDto, MarketplaceSearchResponseDto } from './dto/marketplace-plugin.dto';
import { InstalledNpmPluginDto, InstalledPluginVersionDto } from './dto/installed-npm-plugin.dto';

export const PLUGIN_SYSTEM_INSTANCE_ID = randomUUID();

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController {
  constructor(
    private readonly npmPluginService: NpmPluginService,
    private readonly pluginAdministration: PluginAdministrationService,
  ) {}

  private readonly logger = new Logger(PluginController.name);

  @Get('registries')
  @ApiResponse({ status: 200, type: PluginRegistryDto, isArray: true })
  @Auth('system.plugins.manage')
  listRegistries() {
    return this.npmPluginService.listRegistries();
  }

  @Post('registries')
  @ApiResponse({ status: 201, type: PluginRegistryDto })
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Secret management: stores an npm registry and its access token')
  addRegistry(@Body() body: AddPluginRegistryDto, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.addRegistry(body, auditActorOf(req.user));
  }

  @Post('registries/:registryId/test')
  @Auth('system.plugins.manage')
  async testRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.testRegistry(registryId, auditActorOf(req.user));
    return { ok: true };
  }

  @Delete('registries/:registryId')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Secret management: removes an npm registry and its stored access token')
  removeRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.removeRegistry(registryId, auditActorOf(req.user));
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
  @ApiResponse({ status: 200, type: MarketplaceSearchResponseDto })
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'registryId', required: false, type: String })
  searchMarketplace(@Query('query') query = '', @Query('registryId') registryId?: string) {
    return this.npmPluginService.searchMarketplace(query, registryId);
  }

  @Get('marketplace/:packageName')
  @ApiResponse({ status: 200, type: MarketplacePluginDto })
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
  @NotAnMcpTool('Host lifecycle: removes executable plugin code')
  async removePackageGraph(
    @Param('packageName') packageName: string,
    @Body() body: RemoveInstalledPluginDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.pluginAdministration.removePackageGraph(
      packageName,
      body.approvedDependants ?? [],
      auditActorOf(req.user),
    );
    return { ok: true };
  }

  @Post('npm/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: installs executable plugin code')
  installPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: InstallPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.install(
      packageName,
      version,
      body.registryId,
      body.planToken,
      req && auditActorOf(req.user),
    );
  }

  @Post('npm/:packageName')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: installs executable plugin code')
  installPackageSpec(
    @Param('packageName') packageName: string,
    @Body('spec') spec = 'latest',
    @Body('registryId') registryId?: string,
    @Req() req?: AuthenticatedRequest,
    @Body('planToken') planToken?: string,
  ) {
    return this.pluginAdministration.install(packageName, spec, registryId, planToken, req && auditActorOf(req.user));
  }

  @Delete('installed/:packageName')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: removes executable plugin code')
  async removeInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.removeInstalled(packageName, auditActorOf(req.user));
    return { ok: true };
  }

  @Get('installed')
  @ApiResponse({ status: 200, type: InstalledNpmPluginDto, isArray: true })
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
  @NotAnMcpTool('Host lifecycle: changes automatic plugin updates, which install code')
  setUpdatePolicy(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.setUpdatePolicy(body, auditActorOf(req.user));
  }

  @Post('installed/check')
  @ApiResponse({ status: 201, type: InstalledNpmPluginDto, isArray: true })
  @Auth('system.plugins.manage')
  checkAllInstalledPackages(@Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.checkAllInstalled(auditActorOf(req.user));
  }

  @Post('installed/:packageName/check')
  @Auth('system.plugins.manage')
  checkInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.checkInstalled(packageName, auditActorOf(req.user));
  }

  @Post('installed/:packageName/spec')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: changes which plugin code is installed')
  updateInstalledPackageSpec(
    @Param('packageName') packageName: string,
    @Body('requestedSpec') requestedSpec: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateRequestedSpec(packageName, requestedSpec, auditActorOf(req.user));
  }

  @Post('installed/:packageName/update-override')
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: changes which plugin code is installed')
  updateInstalledPackageOverride(
    @Param('packageName') packageName: string,
    @Body('updateOverride') updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateOverride(packageName, updateOverride, auditActorOf(req.user));
  }

  @Post('installed/:packageName/update-policy')
  @ApiResponse({ status: 201, type: InstalledNpmPluginDto })
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: changes automatic plugin updates, which install code')
  updateInstalledPackagePolicy(
    @Param('packageName') packageName: string,
    @Body() body: UpdateInstalledPluginPolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateVersionPolicy(
      packageName,
      body.requestedSpec,
      body.updateOverride,
      auditActorOf(req.user),
    );
  }

  @Get('installed/:packageName/versions')
  @ApiResponse({ status: 200, type: InstalledPluginVersionDto, isArray: true })
  @Auth('system.plugins.manage')
  installedPackageVersions(@Param('packageName') packageName: string) {
    return this.npmPluginService.installedVersionCandidates(packageName);
  }

  @Post('installed/:packageName/versions/:version')
  @ApiResponse({ status: 201, type: InstalledNpmPluginDto })
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: replaces executable plugin code')
  replaceInstalledPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: ReplaceInstalledPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.replaceInstalled(packageName, version, body, req && auditActorOf(req.user));
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
    return {
      disabled: arePluginsDisabled(),
      instanceId: PLUGIN_SYSTEM_INSTANCE_ID,
      restartRequired: isPluginRestartRequired(),
    };
  }

  @Post('restart')
  @Auth('system.plugins.manage')
  @ApiOperation({
    summary: 'Restart the API process to apply pending plugin changes',
    operationId: 'restartPluginSystem',
  })
  @ApiResponse({ status: 201, type: RestartPluginSystemResponseDto })
  async restartPluginSystem(@Req() req: AuthenticatedRequest): Promise<RestartPluginSystemResponseDto> {
    await this.pluginAdministration.restart(auditActorOf(req.user));
    return { ok: true };
  }

  @Post(':pluginId/retry')
  @Auth('system.plugins.manage')
  @ApiOperation({ summary: 'Retry a failed plugin on restart', operationId: 'retryPlugin' })
  @ApiResponse({ status: 201, type: RetryPluginResponseDto })
  @NotAnMcpTool('Host lifecycle: restarts executable plugin code')
  async retryPlugin(
    @Param('pluginId') pluginId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RetryPluginResponseDto> {
    await this.pluginAdministration.retryPlugin(pluginId, auditActorOf(req.user));
    return { ok: true };
  }

  // Also add support for loading the index.js file
  @Get(':pluginName/frontend/module-federation/*filePath')
  @ApiOperation({ summary: 'Get any frontend plugin file', operationId: 'getFrontendPluginFile' })
  @ApiParam({ name: 'filePath', type: String })
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiResponse({
    status: 200,
    description: 'The requested frontend plugin file',
    type: String,
  })
  getFrontendPluginFile(
    @Param('pluginName') pluginName: string,
    // keep the union: a plain `string` lets the global ValidationPipe comma-join the segments
    @Param('filePath') filePath: string | string[] | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const plugins = PluginService.getPlugins();
    const plugin = plugins.find((plugin) => plugin.name === pluginName);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginName} not found`);
    }
    if (!plugin.main.frontend) {
      throw new NotFoundException(`Plugin ${pluginName} has no frontend assets`);
    }

    const segments = frontendAssetSegments(filePath);
    // An update waiting for the restart keeps serving the frontend of the version that runs.
    const opened = openFrontendAsset(
      frontendAssetRoot(PluginService.PLUGIN_PATH, plugin),
      plugin.pluginDirectory,
      plugin.main.frontend.directory,
      segments,
    );

    if ('reason' in opened) {
      // never echo the requested or resolved path: every rejection looks like a plain missing file
      const detail = `frontend file for plugin ${pluginName} (${opened.reason}): ${sanitizedPathPrefix(segments)}`;
      if (isMissingFrontendAsset(opened.reason)) {
        this.logger.debug(`Missing ${detail}`);
      } else {
        this.logger.warn(`Refused ${detail}`);
      }
      throw new NotFoundException(`Frontend file not found for plugin ${pluginName}`);
    }

    this.logger.debug(`Serving frontend file for plugin ${pluginName}`);

    // stream the already opened file: a failed open inside the stream would answer with its absolute path.
    // Browsers enforce strict MIME checking for stylesheets.
    const fileStream = createReadStream('', { fd: opened.fd });
    // Nest pipes the stream into the response; a client that disconnects early, even before
    // this handler runs, would leave it paused with the file open
    finished(res, () => fileStream.destroy());
    return new StreamableFile(fileStream, {
      type: segments[segments.length - 1].endsWith('.css') ? 'text/css' : 'application/javascript',
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
    return this.pluginAdministration.uploadPlugin(file, auditActorOf(req.user));
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Delete a plugin', operationId: 'deletePlugin' })
  @ApiResponse({
    status: 200,
    description: 'The plugin has been deleted',
  })
  @Auth('system.plugins.manage')
  @NotAnMcpTool('Host lifecycle: removes executable plugin code')
  async deletePlugin(@Param('pluginId') pluginId: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.deletePlugin(pluginId, auditActorOf(req.user));
  }
}
