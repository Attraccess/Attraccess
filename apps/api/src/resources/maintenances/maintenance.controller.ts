import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceMaintenanceService } from './maintenance.service';
import {
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  ListMaintenancesDto,
  PaginatedMaintenanceResponse,
  CanManageMaintenanceResponseDto,
} from './dtos';
import { ResourceMaintenance } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CanManageMaintenance } from './canManageMaintenance.decorator';

@ApiTags('Resource Maintenances')
@Controller('resources/:resourceId/maintenances')
@Auth()
export class ResourceMaintenanceController {
  constructor(private readonly maintenanceService: ResourceMaintenanceService) {}

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
    @Req() request: AuthenticatedRequest
  ): Promise<CanManageMaintenanceResponseDto> {
    const canManage = await this.maintenanceService.canManageMaintenance(request.user, resourceId);

    return {
      canManage,
      resourceId,
    };
  }

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
    @Body() dto: CreateMaintenanceDto
  ): Promise<ResourceMaintenance> {
    return await this.maintenanceService.createMaintenance(resourceId, dto);
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
    @Query() query: ListMaintenancesDto
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
    @Param('maintenanceId', ParseIntPipe) maintenanceId: number
  ): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceService.getMaintenanceById(maintenanceId);

    if (maintenance.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance not found');
    }

    return maintenance;
  }

  @Put(':maintenanceId')
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Update a maintenance',
    description: 'Update a maintenance with new start time, end time, and/or reason',
    operationId: 'updateMaintenance',
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
    description: 'Maintenance updated successfully',
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
    description: 'Maintenance not found',
  })
  async updateMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('maintenanceId', ParseIntPipe) maintenanceId: number,
    @Body() dto: UpdateMaintenanceDto
  ): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceService.getMaintenanceById(maintenanceId);

    if (maintenance.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance not found');
    }

    return await this.maintenanceService.updateMaintenance(maintenanceId, dto);
  }

  @Delete(':maintenanceId')
  @CanManageMaintenance()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel a maintenance',
    description: 'Delete a maintenance (cancel it)',
    operationId: 'cancelMaintenance',
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
    status: 204,
    description: 'Maintenance cancelled successfully',
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
  async cancelMaintenance(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('maintenanceId', ParseIntPipe) maintenanceId: number
  ): Promise<void> {
    const maintenance = await this.maintenanceService.getMaintenanceById(maintenanceId);

    if (maintenance.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance not found');
    }

    await this.maintenanceService.cancelMaintenance(maintenanceId);
  }
}
