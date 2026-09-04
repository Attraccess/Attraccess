import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';

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
  ): Promise<ResourceOperatingAttributionSummary> {
    const canManageResources =
      (request.user as AuthenticatedUser).effectivePermissions?.has('resources.update') === true;
    const canManageMaintenance = await this.maintenanceService.canManageMaintenance(request.user, resourceId);
    if (!canManageResources && !canManageMaintenance) {
      throw new ForbiddenException('You cannot view operating duration for this resource');
    }

    return this.attributionService.getForResource(resourceId);
  }
}
