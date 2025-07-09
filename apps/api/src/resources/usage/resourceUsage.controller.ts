import { Controller, Post, Put, Get, Param, Body, Query, ParseIntPipe, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ResourceUsageService } from './resourceUsage.service';
import { ResourceUsage } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { GetResourceHistoryQueryDto } from './dtos/getResourceHistoryQuery.dto';
import { GetResourceHistoryResponseDto } from './dtos/GetResourceHistoryResponse.dto';
import { GetActiveUsageSessionDto } from './dtos/getActiveUsageSession.dto';
import { CanControlResponseDto } from './dtos/canControl.response.dto';

@ApiTags('Resources')
@Controller('resources/:resourceId/usage')
export class ResourceUsageController {
  constructor(private readonly resourceUsageService: ResourceUsageService) {}

  @Post('start')
  @Auth()
  @ApiOperation({ summary: 'Start a resource usage session', operationId: 'resourceUsageStartSession' })
  @ApiResponse({
    status: 201,
    description: 'Usage session started successfully.',
    type: ResourceUsage,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async startSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: StartUsageSessionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ResourceUsage> {
    return this.resourceUsageService.startSession(resourceId, req.user, dto);
  }

  @Put('end')
  @Auth()
  @ApiOperation({ summary: 'End a resource usage session', operationId: 'resourceUsageEndSession' })
  @ApiResponse({
    status: 200,
    description: 'Usage session ended successfully.',
    type: ResourceUsage,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or no active session',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource or session not found',
  })
  async endSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: EndUsageSessionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ResourceUsage> {
    return this.resourceUsageService.endSession(resourceId, req.user, dto);
  }

  @Get('history')
  @Auth()
  @ApiOperation({ summary: 'Get usage history for a resource', operationId: 'resourceUsageGetHistory' })
  @ApiResponse({
    status: 200,
    description: 'Resource usage history retrieved successfully.',
    type: GetResourceHistoryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid pagination parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async getHistory(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: GetResourceHistoryQueryDto,
    @Req() req: AuthenticatedRequest
  ): Promise<GetResourceHistoryResponseDto> {
    // Allow users to see their own history, or admins to see all history
    const canManageResources = req.user.systemPermissions?.canManageResources === true;
    const isViewingOwnHistory = query.userId === req.user.id || query.userId === undefined;

    // If not an admin and trying to view someone else's history, deny access
    if (!canManageResources && !isViewingOwnHistory) {
      throw new ForbiddenException('You can only view your own usage history');
    }

    // If not an admin, force filtering by the current user's ID
    if (!canManageResources) {
      query.userId = req.user.id;
    }

    const { data, total } = await this.resourceUsageService.getResourceUsageHistory(
      resourceId,
      query.page,
      query.limit,
      query.userId
    );

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get('active')
  @Auth()
  @ApiOperation({ summary: 'Get active usage session for current user', operationId: 'resourceUsageGetActiveSession' })
  @ApiResponse({
    status: 200,
    description: 'Active session retrieved successfully.',
    type: GetActiveUsageSessionDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async getActiveSession(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<GetActiveUsageSessionDto> {
    const activeSession = await this.resourceUsageService.getActiveSession(resourceId);
    return { usage: activeSession || null };
  }

  @Get('can-control')
  @Auth()
  @ApiOperation({ summary: 'Check if the current user can control a resource', operationId: 'resourceUsageCanControl' })
  @ApiResponse({
    status: 200,
    description: 'User can control resource',
    type: CanControlResponseDto,
  })
  async canControl(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest
  ): Promise<CanControlResponseDto> {
    return {
      canControl: await this.resourceUsageService.canControllResource(resourceId, req.user),
    } as CanControlResponseDto;
  }
}
