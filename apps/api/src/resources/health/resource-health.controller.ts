import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthSummaryDto } from './dtos/resource-health-state.dto';

@ApiTags('Resource Health')
@Controller('resources/:resourceId/health')
@Auth()
export class ResourceHealthController {
  constructor(private readonly healthService: ResourceHealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Get health summary for a resource',
    description:
      'Returns the current health state for the resource, including any per-source entries (e.g. heartbeat, payload-derived). Resources without any health-related flow nodes are reported as healthy.',
    operationId: 'getResourceHealth',
  })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiResponse({ status: 200, description: 'Health summary', type: ResourceHealthSummaryDto })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async getResourceHealth(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceHealthSummaryDto> {
    return await this.healthService.getSummary(resourceId);
  }
}
