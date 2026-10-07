import { ResourceUsage } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { GetActiveUsageSessionDto } from './dtos/getActiveUsageSession.dto';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { UpdateUsageSessionProjectDto } from './dtos/updateUsageSessionProject.dto';
import { ResourceUsageControllerRouteContext } from './resourceUsage.controller.route-context';
export abstract class ResourceSessionRoutes extends ResourceUsageControllerRouteContext {
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
  public async getActiveSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<GetActiveUsageSessionDto> {
    const activeSession = await this.resourceUsageService.getActiveSession(resourceId);
    return { usage: activeSession || null };
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
    return this.resourceUsageService.getSessionDetails(resourceId, usageId, req.user);
  }
}
