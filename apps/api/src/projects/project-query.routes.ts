import { Auth, AuthenticatedRequest, Project } from '@attraccess/plugins-backend-sdk';
import { Delete, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { computeNextPage } from '../types/response';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { FindManyProjectsResponseDto } from './dto/find-many-response.dto';
import { ProjectWithAccessDto } from './dto/project-access.dto';
import { ProjectMembershipRoutes } from './project-membership.routes';
export abstract class ProjectQueryRoutesImplementation extends ProjectMembershipRoutes {
  protected transformProject(project: ProjectWithAccessDto | Project): ProjectWithAccessDto {
    const transformedProject = {
      ...project,
      logo: project.logo ? this.fileStorageService.getPublicPath(`projects/${project.id}`, project.logo) : null,
    } as ProjectWithAccessDto;

    return transformedProject;
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Find many projects', operationId: 'findManyProjects' })
  @ApiResponse({ status: 200, description: 'The list of projects.', type: FindManyProjectsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async findMany(
    @Req() req: AuthenticatedRequest,
    @Query() query: FindManyProjectsQueryDto,
  ): Promise<FindManyProjectsResponseDto> {
    const projects = await this.projectsService.findMany(req.user.id, query);
    const total = await this.projectsService.getTotalCount(req.user.id, query);

    return {
      data: projects.map(this.transformProject.bind(this)),
      total,
      page: query.page,
      limit: query.limit,
      nextPage: computeNextPage(query.page, query.limit, total),
    };
  }

  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Get one project', operationId: 'findOneProject' })
  @ApiResponse({ status: 200, description: 'The project.', type: ProjectWithAccessDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async getOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<ProjectWithAccessDto> {
    const project = await this.projectAccessService.getAccessOrThrow(req.user.id, id);
    return this.transformProject(project);
  }

  @Delete(':id')
  @Auth()
  @ApiOperation({ summary: 'Delete a project', operationId: 'deleteOneProject' })
  @ApiResponse({ status: 204, description: 'The project has been successfully deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async deleteOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.projectsService.deleteOne(
      req.user.id,
      id,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
  }

  @Post(':id/archive')
  @Auth()
  @ApiOperation({ summary: 'Archive a project', operationId: 'archiveProject' })
  @ApiResponse({ status: 200, description: 'The project was archived successfully.', type: ProjectWithAccessDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectWithAccessDto> {
    await this.projectsService.archiveOne(
      req.user.id,
      id,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
    const projectWithAccess = await this.projectAccessService.getAccessOrThrow(req.user.id, id);
    return this.transformProject(projectWithAccess);
  }

  @Post(':id/unarchive')
  @Auth()
  @ApiOperation({ summary: 'Unarchive a project', operationId: 'unarchiveProject' })
  @ApiResponse({ status: 200, description: 'The project was unarchived successfully.', type: ProjectWithAccessDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async unarchive(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectWithAccessDto> {
    await this.projectsService.unarchiveOne(
      req.user.id,
      id,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
    const projectWithAccess = await this.projectAccessService.getAccessOrThrow(req.user.id, id);
    return this.transformProject(projectWithAccess);
  }
}
