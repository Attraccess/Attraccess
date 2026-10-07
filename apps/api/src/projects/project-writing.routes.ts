import { Auth, AuthenticatedRequest, Project } from '@attraccess/plugins-backend-sdk';
import { Body, Get, Param, ParseIntPipe, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileUpload } from '../common/types/file-upload.types';
import { CreateProjectDto } from './dto/create.dto';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectWithAccessDto } from './dto/project-access.dto';
import { ProjectUsageHistoryResponseDto } from './dto/project-usage-history-response.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { ProjectQueryRoutesImplementation } from './project-query.routes';
export abstract class ProjectWritingRoutesImplementation extends ProjectQueryRoutesImplementation {
  @Post()
  @Auth()
  @ApiOperation({ summary: 'Create a project', operationId: 'createProject' })
  @ApiResponse({ status: 201, description: 'The project was created successfully.', type: ProjectWithAccessDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() data: CreateProjectDto,
    @UploadedFile() logo?: FileUpload,
  ): Promise<Project> {
    if (logo) {
      data.logo = logo;
    }
    const project = await this.projectsService.create(
      req.user.id,
      data,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
    const projectWithAccess = await this.projectAccessService.getAccessOrThrow(req.user.id, project.id);
    return this.transformProject(projectWithAccess);
  }

  @Put(':id')
  @Auth()
  @ApiOperation({ summary: 'Update a project', operationId: 'updateProject' })
  @ApiResponse({ status: 200, description: 'The project was updated successfully.', type: ProjectWithAccessDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateProjectDto,
    @UploadedFile() logo?: FileUpload,
  ): Promise<Project> {
    if (logo) {
      data.logo = logo;
    }
    const project = await this.projectsService.updateOne(
      req.user.id,
      id,
      data,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
    const projectWithAccess = await this.projectAccessService.getAccessOrThrow(req.user.id, project.id);
    return this.transformProject(projectWithAccess);
  }

  @Get(':id/usage/history')
  @Auth()
  @ApiOperation({ summary: 'Get usage history for a project', operationId: 'getProjectUsageHistory' })
  @ApiResponse({
    status: 200,
    description: 'Usage history retrieved successfully.',
    type: ProjectUsageHistoryResponseDto,
  })
  async getUsageHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GetProjectUsageHistoryQueryDto,
  ): Promise<ProjectUsageHistoryResponseDto> {
    return await this.projectUsageService.getProjectUsageHistory(req.user.id, id, query);
  }

  @Get(':id/usage/stats')
  @Auth()
  @ApiOperation({ summary: 'Get aggregated usage statistics for a project', operationId: 'getProjectUsageStats' })
  @ApiResponse({
    status: 200,
    description: 'Usage statistics retrieved successfully.',
    type: ProjectUsageStatsDto,
  })
  async getUsageStats(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProjectUsageStatsQueryDto,
  ): Promise<ProjectUsageStatsDto> {
    return await this.projectUsageService.getProjectUsageStats(req.user.id, id, query);
  }
}
