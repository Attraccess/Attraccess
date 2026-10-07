import { ResourceMaintenance } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LicenseModuleType } from '../../license/license.service';
import { RequiresLicense } from '../../license/require-license.decorator';
import { CanManageMaintenanceResponseDto, ListMaintenancesDto, PaginatedMaintenanceResponse } from './dtos';
import { MaintenanceManagementRoutes } from './maintenance-management.routes';
import { ResourceMaintenanceService } from './maintenance.service';
import { installInheritedMethods } from '../../common/inherited-implementation';

@RequiresLicense(LicenseModuleType.MAINTENANCE)
@ApiTags('Resource Maintenances')
@Controller('resources/:resourceId/maintenances')
@Auth()
export class ResourceMaintenanceController extends MaintenanceManagementRoutes {
  constructor(protected readonly maintenanceService: ResourceMaintenanceService) {
    super();
  }

  @Get('can-manage')
  @ApiOperation({
    summary: 'Check if user can manage maintenance',
    description: 'Check if the authenticated user has permission to manage maintenance for the specified resource',
    operationId: 'canManageMaintenance',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Permission check completed successfully',
    type: CanManageMaintenanceResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async canManageMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<CanManageMaintenanceResponseDto> {
    const canManage = await this.maintenanceService.canManageMaintenance(request.user, resourceId);

    return {
      canManage,
      resourceId,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get maintenances for a resource',
    description: 'Retrieve paginated list of maintenances for a specific resource with optional filtering',
    operationId: 'findMaintenances',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource',
    type: Number,
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page',
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: 'includeUpcoming',
    description: 'Include upcoming maintenances (start time in the future)',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiQuery({
    name: 'includeActive',
    description: 'Include active maintenances (currently ongoing)',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiQuery({
    name: 'includePast',
    description: 'Include past maintenances (already finished)',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Maintenances retrieved successfully',
    type: PaginatedMaintenanceResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async getMaintenances(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: ListMaintenancesDto,
  ): Promise<PaginatedMaintenanceResponse> {
    return await this.maintenanceService.findMaintenances(resourceId, query);
  }

  @Get(':maintenanceId')
  @ApiOperation({
    summary: 'Get a specific maintenance by ID',
    description: 'Retrieve details of a specific maintenance',
    operationId: 'getMaintenance',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource',
    type: Number,
  })
  @ApiParam({
    name: 'maintenanceId',
    description: 'The ID of the maintenance',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Maintenance retrieved successfully',
    type: ResourceMaintenance,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Maintenance not found',
  })
  async getMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('maintenanceId', ParseIntPipe) maintenanceId: number,
  ): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceService.getMaintenanceById(maintenanceId);

    if (maintenance.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance not found');
    }

    return maintenance;
  }
}
installInheritedMethods(ResourceMaintenanceController, [
  'canManageMaintenance',
  'createMaintenance',
  'getMaintenances',
  'getMaintenance',
  'finishMaintenance',
]);
