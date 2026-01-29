import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Sse } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { PositionalTrackingService, PositionalDebugEvent } from './positional-tracking.service';
import { UpdateGatewayCalibrationDto } from './dtos/updateGatewayCalibration.dto';
import { PositionalGatewayResponseDto } from './dtos/positionalGatewayResponse.dto';
import { CreateGatewayDto } from './dtos/createGateway.dto';
import { UpdateGatewayDto } from './dtos/updateGateway.dto';
import { CreateBeaconDto } from './dtos/createBeacon.dto';
import { UpdateBeaconDto } from './dtos/updateBeacon.dto';
import { PositionalBeaconResponseDto } from './dtos/positionalBeaconResponse.dto';

interface MessageEvent {
  data: PositionalDebugEvent;
}

@ApiTags('PositionalTracking')
@Controller('positional-tracking')
export class PositionalTrackingController {
  constructor(private readonly positionalTrackingService: PositionalTrackingService) { }

  @Sse('debug')
  @Auth('canManageResources')
  streamDebug(): Observable<MessageEvent> {
    return this.positionalTrackingService.getDebugStream().pipe(
      map((event) => ({
        data: event,
      })),
    );
  }

  @Get('gateways')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'List BLE gateways for positional tracking', operationId: 'getPositionalTrackingGateways' })
  @ApiResponse({
    status: 200,
    description: 'List of gateways used for positional tracking.',
    type: PositionalGatewayResponseDto,
    isArray: true,
  })
  async listGateways(): Promise<PositionalGatewayResponseDto[]> {
    return this.positionalTrackingService.listGatewaysForCalibration();
  }

  @Get('gateways/:id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Get a BLE gateway by ID', operationId: 'getPositionalTrackingGatewayById' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Gateway retrieved successfully.',
    type: PositionalGatewayResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Gateway not found',
  })
  async getGateway(@Param('id', ParseIntPipe) id: number): Promise<PositionalGatewayResponseDto> {
    return this.positionalTrackingService.getGatewayForCalibration(id);
  }

  @Post('gateways')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Create a BLE gateway', operationId: 'createPositionalTrackingGateway' })
  @ApiResponse({
    status: 201,
    description: 'Gateway created successfully.',
    type: PositionalGatewayResponseDto,
  })
  async createGateway(@Body() dto: CreateGatewayDto): Promise<PositionalGatewayResponseDto> {
    return this.positionalTrackingService.createGateway(dto);
  }

  @Put('gateways/:id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update a BLE gateway', operationId: 'updatePositionalTrackingGateway' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Gateway updated successfully.',
    type: PositionalGatewayResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Gateway not found',
  })
  async updateGateway(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGatewayDto,
  ): Promise<PositionalGatewayResponseDto> {
    return this.positionalTrackingService.updateGateway(id, dto);
  }

  @Delete('gateways/:id')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Delete a BLE gateway', operationId: 'deletePositionalTrackingGateway' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Gateway deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Gateway not found',
  })
  async deleteGateway(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.positionalTrackingService.deleteGateway(id);
  }

  @Put('gateways/:id/calibration')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update gateway calibration', operationId: 'updatePositionalTrackingGatewayCalibration' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Gateway calibration updated successfully.',
    type: PositionalGatewayResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Gateway not found',
  })
  async updateGatewayCalibration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGatewayCalibrationDto,
  ): Promise<PositionalGatewayResponseDto> {
    return this.positionalTrackingService.updateGatewayCalibration(id, dto);
  }

  @Get('beacons')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'List tracked beacons', operationId: 'getPositionalTrackingBeacons' })
  @ApiResponse({
    status: 200,
    description: 'List of beacons used for positional tracking.',
    type: PositionalBeaconResponseDto,
    isArray: true,
  })
  async listBeacons(): Promise<PositionalBeaconResponseDto[]> {
    return this.positionalTrackingService.listBeacons();
  }

  @Post('beacons')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Create a tracked beacon', operationId: 'createPositionalTrackingBeacon' })
  @ApiResponse({
    status: 201,
    description: 'Beacon created successfully.',
    type: PositionalBeaconResponseDto,
  })
  async createBeacon(@Body() dto: CreateBeaconDto): Promise<PositionalBeaconResponseDto> {
    return this.positionalTrackingService.createBeacon(dto);
  }

  @Put('beacons/:identifier')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update a tracked beacon', operationId: 'updatePositionalTrackingBeacon' })
  @ApiParam({ name: 'identifier', type: 'string', example: 'aabbccddeeff' })
  @ApiResponse({
    status: 200,
    description: 'Beacon updated successfully.',
    type: PositionalBeaconResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Beacon not found',
  })
  async updateBeacon(
    @Param('identifier') identifier: string,
    @Body() dto: UpdateBeaconDto,
  ): Promise<PositionalBeaconResponseDto> {
    return this.positionalTrackingService.updateBeacon(identifier, dto);
  }

  @Delete('beacons/:identifier')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Delete a tracked beacon', operationId: 'deletePositionalTrackingBeacon' })
  @ApiParam({ name: 'identifier', type: 'string', example: 'aabbccddeeff' })
  @ApiResponse({
    status: 200,
    description: 'Beacon deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Beacon not found',
  })
  async deleteBeacon(@Param('identifier') identifier: string): Promise<void> {
    await this.positionalTrackingService.deleteBeacon(identifier);
  }
}
