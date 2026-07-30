import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { PluginService } from './plugin.service';
import { createReadStream, existsSync } from 'fs';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoadedPluginManifest } from './plugin.manifest';
import { join } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUpload } from '../common/types/file-upload.types';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { UploadPluginDto } from './dto/uploadPlugin.dto';

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

  constructor(private readonly pluginService: PluginService) {}

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async uploadPlugin(@UploadedFile() file: FileUpload, @Body() body: UploadPluginDto) {
    this.logger.log(`Uploading plugin ${file.originalname}`);
    return await this.pluginService.uploadPlugin(file);
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Delete a plugin', operationId: 'deletePlugin' })
  @ApiResponse({
    status: 200,
    description: 'The plugin has been deleted',
  })
  @Auth('system.plugins.manage')
  deletePlugin(@Param('pluginId') pluginId: string) {
    return this.pluginService.deletePlugin(pluginId);
  }
}
