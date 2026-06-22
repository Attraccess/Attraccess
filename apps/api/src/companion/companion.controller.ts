import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { CompanionDevice } from '@attraccess/database-entities';
import { CompanionService } from './companion.service';
import { CompanionGateway } from './companion.gateway';
import { CompanionGatewayService } from './companion-gateway.service';

class RenameCompanionDeviceDto {
  name!: string;
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
  @Auth('canManageResources')
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
    return this.service.updateName(id, dto.name);
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
