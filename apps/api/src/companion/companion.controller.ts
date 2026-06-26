import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { CompanionDevice } from '@attraccess/database-entities';
import { Response } from 'express';
import { CompanionService } from './companion.service';
import { CompanionGateway } from './companion.gateway';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionManifestDto } from './dtos/companion.dto';
import { MetricsService } from '../metrics/metrics.service';

class RenameCompanionDeviceDto {
  name!: string;
}

@ApiTags('Companion')
@Controller('companion')
export class CompanionDownloadController {
  private readonly logger = new Logger(CompanionDownloadController.name);

  public constructor(
    @Inject(CompanionService) private readonly service: CompanionService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  @Get('versions')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Get companion app manifest', operationId: 'getCompanionVersions' })
  @ApiResponse({ status: 200, type: CompanionManifestDto })
  @ApiResponse({ status: 404, description: 'No companion manifest available' })
  getVersions(): CompanionManifestDto {
    const manifest = this.service.getManifest();
    if (!manifest) {
      throw new NotFoundException('No companion manifest available');
    }
    return manifest;
  }

  @Get('download/:platform/:arch')
  @Auth()
  @ApiOperation({ summary: 'Download companion app binary', operationId: 'downloadCompanionBinary' })
  @ApiParam({ name: 'platform', example: 'linux' })
  @ApiParam({ name: 'arch', example: 'x64' })
  @ApiResponse({ status: 200, description: 'Binary stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Platform/arch not found' })
  async downloadBinary(
    @Param('platform') platform: string,
    @Param('arch') arch: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { stream, size, filename } = this.service.getBinaryStream(platform, arch);

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': size.toString(),
        'Cache-Control': 'no-cache',
      });

      stream.on('error', (err) => {
        this.logger.error(`Stream error: ${err.message}`, err.stack);
        this.metrics.companionDownloadsTotal.inc({ platform, arch, status: 'error' });
        if (!res.headersSent) {
          res.status(500).send('Stream error during download');
        }
      });

      this.metrics.companionDownloadsTotal.inc({ platform, arch, status: 'success' });
      stream.pipe(res);
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.metrics.companionDownloadsTotal.inc({ platform, arch, status: 'not_found' });
        res.status(404).send(err.message);
        return;
      }
      this.logger.error(`Error serving companion binary: ${(err as Error).message}`);
      this.metrics.companionDownloadsTotal.inc({ platform, arch, status: 'error' });
      res.status(500).send('Internal server error');
    }
  }
}

@ApiTags('Companion Devices')
@Controller('companion-devices')
@UseInterceptors(ClassSerializerInterceptor)
export class CompanionController {
  public constructor(
    @Inject(CompanionService) private readonly service: CompanionService,
    @Inject(CompanionGateway) private readonly gateway: CompanionGateway,
    @Inject(CompanionGatewayService) private readonly gatewayService: CompanionGatewayService,
  ) {}

  @Get()
  @Auth('canManageResources')
  @ApiOperation({ summary: 'List all registered companion devices', operationId: 'listCompanionDevices' })
  @ApiResponse({ status: 200, type: [CompanionDevice] })
  async list(): Promise<CompanionDevice[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Get a companion device', operationId: 'getCompanionDevice' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: CompanionDevice })
  @ApiResponse({ status: 404 })
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<CompanionDevice & { connected: boolean }> {
    const device = await this.service.findById(id);
    if (!device) throw new NotFoundException(`Companion device ${id} not found`);

    const connected = [...this.gatewayService.sockets.values()].some((s) => s.deviceId === id);
    return { ...device, connected };
  }

  @Get(':id/resources')
  @Auth()
  @ApiOperation({ summary: 'List resources that reference this companion device', operationId: 'getCompanionDeviceResources' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getResources(@Param('id', ParseIntPipe) id: number): Promise<Array<{ id: number; name: string }>> {
    const device = await this.service.findById(id);
    if (!device) throw new NotFoundException(`Companion device ${id} not found`);

    return this.gatewayService.getResourcesForDevice(id);
  }

  @Patch(':id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Rename a companion device', operationId: 'renameCompanionDevice' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RenameCompanionDeviceDto })
  @ApiResponse({ status: 200, type: CompanionDevice })
  @ApiResponse({ status: 404 })
  async rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameCompanionDeviceDto,
  ): Promise<CompanionDevice> {
    const device = await this.service.findById(id);
    if (!device) throw new NotFoundException(`Companion device ${id} not found`);
    const updated = await this.service.updateName(id, dto.name);
    this.gatewayService.sendDeviceRenamed(id, dto.name);
    return updated;
  }

  @Delete(':id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Delete a companion device and kick its connection', operationId: 'deleteCompanionDevice' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    const device = await this.service.findById(id);
    if (!device) throw new NotFoundException(`Companion device ${id} not found`);

    this.gateway.disconnectDevice(id);
    await this.service.delete(id);
  }
}
