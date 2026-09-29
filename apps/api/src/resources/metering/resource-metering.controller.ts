import { Controller, Get, Param, ParseUUIDPipe, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { ResourceMeteringService } from './resource-metering.service';
import {
  ResourceMeteringLiveDto,
  ResourceMeteringSettlementDto,
  ResourceMeteringStatusDto,
} from './resource-metering.dto';

@ApiTags('Resource Metering')
@Controller('resources/:resourceId/metering')
@Auth('billing.manage')
export class ResourceMeteringController {
  constructor(private readonly metering: ResourceMeteringService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the meter definition and energy settlement status',
    operationId: 'getResourceMeteringStatus',
  })
  @ApiResponse({ status: 200, type: ResourceMeteringStatusDto })
  getStatus(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceMeteringStatusDto> {
    return this.metering.getStatus(resourceId);
  }

  @Get('live')
  @Auth()
  @ApiOperation({
    summary: 'Get the live meter value and energy cost of the running session',
    operationId: 'getResourceMeteringLive',
  })
  @ApiResponse({ status: 200, type: ResourceMeteringLiveDto })
  async getLive(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceMeteringLiveDto> {
    return this.metering.getLive(resourceId);
  }

  @Post('sessions/:sessionId/retry')
  @ApiOperation({
    summary: 'Collect the final energy total again and bill a pending energy charge as a correction transaction',
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
  @ApiOperation({ summary: 'Give up the energy charge of a usage', operationId: 'waiveResourceMeteringSettlement' })
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
