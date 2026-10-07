import { ResourceMaintenance } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, NotFoundException, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CanManageMaintenance } from './canManageMaintenance.decorator';
import { CreateMaintenanceDto, FinishMaintenanceDto } from './dtos';
import { ResourceMaintenanceControllerRouteContext } from './maintenance.controller.route-context';
export abstract class MaintenanceManagementRoutes extends ResourceMaintenanceControllerRouteContext {
  @Post()
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Create a maintenance for a resource',
    description: 'Create a new maintenance schedule for a specific resource',
    operationId: 'createMaintenance',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource',
    type: Number,
  })
  @ApiResponse({
    status: 201,
    description: 'Maintenance created successfully',
    type: ResourceMaintenance,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid maintenance data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage maintenances for this resource',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async createMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateMaintenanceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResourceMaintenance> {
    return await this.maintenanceService.createMaintenance(resourceId, dto, request.user?.id);
  }

  @Post(':maintenanceId/finish')
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Mark a maintenance as done',
    description:
      'Finish an active maintenance (set end time, completedAt, completedBy). Only maintenance users can call this.',
    operationId: 'finishMaintenance',
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
    description: 'Maintenance marked as done successfully',
    type: ResourceMaintenance,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - maintenance is already finished',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage maintenances for this resource',
  })
  @ApiResponse({
    status: 404,
    description: 'Maintenance not found',
  })
  async finishMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('maintenanceId', ParseIntPipe) maintenanceId: number,
    @Body() dto: FinishMaintenanceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceService.getMaintenanceById(maintenanceId);

    if (maintenance.resourceId !== Number(resourceId)) {
      throw new NotFoundException('Maintenance not found');
    }

    return await this.maintenanceService.finishMaintenance(maintenanceId, {
      userId: request.user?.id,
      notes: dto?.notes,
    });
  }
}
