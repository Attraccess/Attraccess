import {
  Controller,
  Logger,
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

import { auditActorOf } from '../audit/recorder/audit-event';

import { installInheritedMethods } from '../common/inherited-implementation';

import { NpmPluginService } from './npm-plugin.service';

import { PluginAdministrationService } from './plugin-administration.service';

import { PluginService } from './plugin.service';

import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';

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
    protected readonly npmPluginService: NpmPluginService,
    protected readonly pluginAdministration: PluginAdministrationService,
  ) {
    super();
  }

  protected readonly logger = new Logger(PluginController.name);

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
    await this.pluginAdministration.retryPlugin(pluginId, auditActorOf(req.user));
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
    return this.pluginAdministration.uploadPlugin(file, auditActorOf(req.user));
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Delete a plugin', operationId: 'deletePlugin' })
  @ApiResponse({
    status: 200,
    description: 'The plugin has been deleted',
  })
  @Auth('system.plugins.manage')
  async deletePlugin(@Param('pluginId') pluginId: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.deletePlugin(pluginId, auditActorOf(req.user));
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
]);
