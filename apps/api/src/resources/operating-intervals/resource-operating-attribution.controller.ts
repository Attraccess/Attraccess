import { BadRequestException, Controller, ForbiddenException, Get, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { ResourceOperatingAttributionQueryDto } from './dtos/resourceOperatingAttributionQuery.dto';

@ApiTags('Resources')
@Controller('resources/:resourceId/operating-attribution')
export class ResourceOperatingAttributionController {
  constructor(
    private readonly attributionService: ResourceOperatingAttributionService,
    private readonly maintenanceService: ResourceMaintenanceService,
  ) {}

  @Get()
  @Auth()
  @ApiOperation({
    summary: 'Get operating time attributed to usage sessions',
    operationId: 'resourceOperatingAttributionGet',
  })
  @ApiResponse({ status: 200, description: 'Operating attribution retrieved successfully.' })
  async getForResource(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
    @Query() query: ResourceOperatingAttributionQueryDto,
  ): Promise<ResourceOperatingAttributionSummary> {
    const canManageResources =
      (request.user as AuthenticatedUser).effectivePermissions?.has('resources.update') === true;
    const canManageMaintenance = await this.maintenanceService.canManageMaintenance(request.user, resourceId);
    if (!canManageResources && !canManageMaintenance) {
      throw new ForbiddenException('You cannot view operating duration for this resource');
    }

    if (Boolean(query.start) !== Boolean(query.end)) {
      throw new BadRequestException('Both start and end must be provided together');
    }

    if (!query.start || !query.end) {
      return this.attributionService.getForResource(resourceId);
    }

    const windowStart = new Date(query.start);
    const asOf = new Date(query.end);
    if (windowStart >= asOf) {
      throw new BadRequestException('Start must be before end');
    }

    return this.attributionService.getForResource(resourceId, asOf, windowStart);
  }
}
