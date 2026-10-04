import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { ResourceMeteringService } from './resource-metering.service';
import {
  MeterNameDto,
  MeterRateDto,
  ResourceMeterDto,
  ResourceMeteringLiveDto,
  ResourceMeteringSettlementDto,
  ResourceMeteringStatusDto,
} from './resource-metering.dto';

@ApiTags('Resource Metering')
@Controller('resources/:resourceId/metering')
@Auth('billing.manage')
export class ResourceMeteringController {
  constructor(private readonly metering: ResourceMeteringService) {}

  @Get('meters')
  @Auth()
  @ApiOperation({
    summary: 'List the resource meters, lifetime totals and session consumption',
    operationId: 'listResourceMeters',
  })
  @ApiResponse({ status: 200, type: [ResourceMeterDto] })
  list(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceMeterDto[]> {
    return this.metering.listMeters(resourceId);
  }

  @Post('meters')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Create a named meter', operationId: 'createResourceMeter' })
  @ApiResponse({ status: 201, type: ResourceMeterDto })
  create(@Param('resourceId', ParseIntPipe) resourceId: number, @Body() body: MeterNameDto): Promise<ResourceMeterDto> {
    return this.metering.createMeter(resourceId, body.name);
  }

  @Patch('meters/:meterId')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Rename a meter', operationId: 'updateResourceMeter' })
  @ApiResponse({ status: 200, type: ResourceMeterDto })
  update(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('meterId', ParseIntPipe) meterId: number,
    @Body() body: MeterNameDto,
  ): Promise<ResourceMeterDto> {
    return this.metering.updateMeter(resourceId, meterId, body.name);
  }

  @Patch('meters/:meterId/rate')
  @ApiOperation({ summary: 'Configure the meter billing rate', operationId: 'setResourceMeterRate' })
  @ApiResponse({ status: 200, type: ResourceMeterDto })
  setRate(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('meterId', ParseIntPipe) meterId: number,
    @Body() body: MeterRateDto,
  ): Promise<ResourceMeterDto> {
    return this.metering.setRate(resourceId, meterId, body.creditsPerUnit);
  }

  @Get()
  @ApiOperation({
    summary: 'Get the meter definition and meter settlement status',
    operationId: 'getResourceMeteringStatus',
  })
  @ApiResponse({ status: 200, type: ResourceMeteringStatusDto })
  getStatus(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceMeteringStatusDto> {
    return this.metering.getStatus(resourceId);
  }

  @Get('live')
  @Auth()
  @ApiOperation({
    summary: 'Get the live meter value and meter cost of the running session',
    operationId: 'getResourceMeteringLive',
  })
  @ApiResponse({ status: 200, type: ResourceMeteringLiveDto })
  async getLive(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceMeteringLiveDto> {
    return this.metering.getLive(resourceId);
  }

  @Post('sessions/:sessionId/retry')
  @ApiOperation({
    summary: 'Collect the final meter total again and bill a pending meter charge as a correction transaction',
    operationId: 'retryResourceMeteringSettlement',
  })
  @ApiResponse({ status: 201, type: ResourceMeteringSettlementDto })
  async retry(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceMeteringSettlementDto> {
    return this.toDto(await this.metering.retrySettlement(resourceId, sessionId, req.user.id));
  }

  @Post('sessions/:sessionId/waive')
  @ApiOperation({ summary: 'Give up the meter charge of a usage', operationId: 'waiveResourceMeteringSettlement' })
  @ApiResponse({ status: 201, type: ResourceMeteringSettlementDto })
  async waive(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceMeteringSettlementDto> {
    return this.toDto(await this.metering.waive(resourceId, sessionId, req.user.id));
  }

  private toDto(session: ResourceMeteringSession): ResourceMeteringSettlementDto {
    return { sessionId: session.id, status: session.status, chargeCredits: session.chargeCredits };
  }
}
