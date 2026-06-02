import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MaintenanceRequestService } from './maintenance-request.service';
import {
  CreateMaintenanceRequestDto,
  ResolveMaintenanceRequestDto,
  ListMaintenanceRequestsDto,
  PaginatedMaintenanceRequestResponse,
} from './dtos';
import { ResourceMaintenanceRequest } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CanManageMaintenance } from './canManageMaintenance.decorator';

@ApiTags('Resource Maintenances')
@Controller('resources/:resourceId/maintenance-requests')
@Auth()
export class MaintenanceRequestController {
  constructor(private readonly requestService: MaintenanceRequestService) {}

  @Post()
  @ApiOperation({
    summary: 'Request maintenance for a resource',
    description: 'Any authenticated user can report a resource as broken and request maintenance.',
    operationId: 'createMaintenanceRequest',
  })
  @ApiParam({ name: 'resourceId', description: 'The ID of the resource', type: Number })
  @ApiResponse({ status: 201, description: 'Maintenance request created', type: ResourceMaintenanceRequest })
  @ApiResponse({ status: 400, description: 'Bad request - invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async createRequest(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateMaintenanceRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResourceMaintenanceRequest> {
    return await this.requestService.createRequest(resourceId, request.user.id, dto.reason);
  }

  @Get()
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'List maintenance requests for a resource',
    description: 'Retrieve paginated maintenance requests. Only maintenance users can call this.',
    operationId: 'listMaintenanceRequests',
  })
  @ApiParam({ name: 'resourceId', description: 'The ID of the resource', type: Number })
  @ApiResponse({ status: 200, description: 'Requests retrieved', type: PaginatedMaintenanceRequestResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot manage maintenance for this resource' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async listRequests(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: ListMaintenanceRequestsDto,
  ): Promise<PaginatedMaintenanceRequestResponse> {
    return await this.requestService.listRequests(resourceId, query);
  }

  @Post(':requestId/resolve')
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Resolve a maintenance request',
    description:
      "Resolve an open request: 'convert' starts an instant maintenance from it, 'dismiss' closes it. Only maintenance users can call this.",
    operationId: 'resolveMaintenanceRequest',
  })
  @ApiParam({ name: 'resourceId', description: 'The ID of the resource', type: Number })
  @ApiParam({ name: 'requestId', description: 'The ID of the maintenance request', type: Number })
  @ApiResponse({ status: 200, description: 'Request resolved', type: ResourceMaintenanceRequest })
  @ApiResponse({ status: 400, description: 'Bad request - request already resolved' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot manage maintenance for this resource' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async resolveRequest(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ResolveMaintenanceRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResourceMaintenanceRequest> {
    return await this.requestService.resolveRequest(resourceId, requestId, request.user.id, dto.action, dto.reason);
  }
}
