import { Controller, Delete, Get, HttpCode, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthSummaryDto } from './dtos/resource-health-state.dto';
import { CanManageMaintenance } from '../maintenances/canManageMaintenance.decorator';

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

  @Delete('entries/:entryId')
  @CanManageMaintenance()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Clear a health entry (manually mark healthy)',
    description:
      'Deletes a single health state entry. Use this to clear a stuck unhealthy state when the originating flow node was deleted or its identifier changed. Requires maintenance management permission.',
    operationId: 'clearResourceHealthEntry',
  })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiParam({ name: 'entryId', type: Number })
  @ApiResponse({ status: 204, description: 'Entry cleared' })
  @ApiResponse({ status: 403, description: 'Missing maintenance management permission' })
  @ApiResponse({ status: 404, description: 'Health entry or resource not found' })
  async clearResourceHealthEntry(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('entryId', ParseIntPipe) entryId: number,
  ): Promise<void> {
    await this.healthService.clearEntry(resourceId, entryId);
  }
}
