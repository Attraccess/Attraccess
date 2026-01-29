import { Body, Controller, Get, Param, ParseIntPipe, Put, Sse } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { PositionalTrackingService, PositionalDebugEvent } from './positional-tracking.service';
import { UpdateGatewayCalibrationDto } from './dtos/updateGatewayCalibration.dto';
import { PositionalGatewayResponseDto } from './dtos/positionalGatewayResponse.dto';

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
  @ApiOperation({ summary: 'List BLE gateways for calibration', operationId: 'getPositionalTrackingGateways' })
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
}
