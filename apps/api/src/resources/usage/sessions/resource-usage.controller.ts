import { ResourceUsage } from '@attraccess/database-entities';

import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Req, Body, Put } from '@nestjs/common';

import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CanControlResponseDto } from '../dtos/canControl.response.dto';

import { GetResourceHistoryQueryDto } from '../dtos/getResourceHistoryQuery.dto';

import { GetResourceHistoryResponseDto } from '../dtos/GetResourceHistoryResponse.dto';

import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { GetActiveUsageSessionDto } from '../dtos/getActiveUsageSession.dto';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';

@ApiTags('Resources')
@Controller('resources/:resourceId/usage')
export class ResourceUsageController {
  constructor(
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly activityVisibility: ResourceActivityVisibilityService,
  ) {}

  @Post('lock')
  @Auth()
  @ApiOperation({ summary: 'Lock a resource of door type', operationId: 'lockDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door locked successfully.',
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
  async lockDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return await this.resourceUsageService.lockDoor(resourceId, req.user);
  }

  @Post('unlock')
  @Auth()
  @ApiOperation({ summary: 'Unlock a resource of door type', operationId: 'unlockDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door unlocked successfully.',
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
  async unlockDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return await this.resourceUsageService.unlockDoor(resourceId, req.user);
  }

  @Post('unlatch')
  @Auth()
  @ApiOperation({ summary: 'Unlatch a resource of door type (if supported)', operationId: 'unlatchDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door unlatch successfully.',
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
  async unlatchDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return await this.resourceUsageService.unlatchDoor(resourceId, req.user);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<GetResourceHistoryResponseDto> {
    // The shared visibility rule decides: full sees every session, anonymous sees them redacted, none only their own.
    const access = await this.activityVisibility.resolve(req.user, resourceId);
    const isViewingOwnHistory = query.userId === req.user.id || query.userId === undefined;

    // Filtering by another user would link a name to the redacted sessions, so it needs full access.
    if (access !== 'full' && !isViewingOwnHistory) {
      throw new ForbiddenException('You can only view your own usage history');
    }
    if (access === 'none') {
      query.userId = req.user.id;
    }

    const { data: sessions, total } = await this.resourceUsageService.getResourceUsageHistory(
      resourceId,
      query.page,
      query.limit,
      query.userId,
    );
    const data = sessions
      .map((session) => this.activityVisibility.viewUsage(session, access, req.user.id))
      .filter((session): session is ResourceUsage => session !== null);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };
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
    @Req() req: AuthenticatedRequest,
  ): Promise<CanControlResponseDto> {
    return {
      canControl: await this.resourceUsageService.canControllResource(resourceId, req.user),
    } as CanControlResponseDto;
  }

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
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return this.resourceUsageService.startSession(resourceId, req.user, dto, {
      auditOrigin: {
        actorId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        ...(req.user.apiTokenId === undefined ? {} : { apiTokenId: req.user.apiTokenId }),
      },
    });
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return this.resourceUsageService.endSession(resourceId, req.user, dto, {
      auditOrigin: {
        actorId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        ...(req.user.apiTokenId === undefined ? {} : { apiTokenId: req.user.apiTokenId }),
      },
    });
  }

  @Put('sessions/:usageId/project')
  @Auth()
  @ApiOperation({
    summary: 'Update usage session project assignment',
    operationId: 'resourceUsageUpdateSessionProject',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage session project updated successfully.',
    type: ResourceUsage,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or session is active',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not authorized to update this session',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource or session not found',
  })
  async updateSessionProject(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('usageId', ParseIntPipe) usageId: number,
    @Body() dto: UpdateUsageSessionProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return this.resourceUsageService.updateSessionProject(resourceId, usageId, req.user, dto);
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Activity on this resource is not visible to the user',
  })
  public async getActiveSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<GetActiveUsageSessionDto> {
    const access = await this.activityVisibility.resolve(req.user, resourceId);
    const activeSession = await this.resourceUsageService.getActiveSession(resourceId);
    if (!activeSession) {
      if (access === 'none') throw new ForbiddenException('You cannot view activity on this resource');
      return { usage: null };
    }
    const usage = this.activityVisibility.viewUsage(activeSession, access, req.user.id);
    if (!usage) throw new ForbiddenException('You cannot view activity on this resource');
    return { usage };
  }

  @Get(':usageId')
  @Auth()
  @ApiOperation({ summary: 'Get a resource usage session', operationId: 'resourceUsageGetSession' })
  @ApiResponse({ status: 200, description: 'The usage session details.', type: ResourceUsage })
  @ApiResponse({ status: 404, description: 'Usage session not found or not accessible.' })
  async getSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('usageId', ParseIntPipe) usageId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    const access = await this.activityVisibility.resolve(req.user, resourceId);
    // Viewers with full or anonymous access need no project membership; with none, only their own session passes.
    const usage = await this.resourceUsageService.getSessionDetails(resourceId, usageId, req.user, access !== 'none');
    const view = this.activityVisibility.viewUsage(usage, access, req.user.id);
    if (!view) throw new ForbiddenException('You cannot view activity on this resource');
    return view;
  }
}
