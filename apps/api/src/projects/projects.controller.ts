import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { Auth, AuthenticatedRequest, Project } from '@attraccess/plugins-backend-sdk';
import { ProjectInvitation } from '@attraccess/database-entities';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { FindManyProjectsResponseDto } from './dto/find-many-response.dto';
import { CreateProjectDto } from './dto/create.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUpload } from '../common/types/file-upload.types';
import { ProjectUsageService } from './project-usage.service';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageHistoryResponseDto } from './dto/project-usage-history-response.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { FileStorageService } from '../common/services/file-storage.service';
import { UpdateProjectDto } from './dto/update.dto';
import { ProjectAccessService } from './project-access.service';
import { ProjectWithAccessDto } from './dto/project-access.dto';
import { ProjectMembersResponseDto } from './dto/project-members-response.dto';
import { CreateProjectInvitationDto } from './dto/create-project-invitation.dto';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly fileStorageService: FileStorageService,
    private readonly projectUsageService: ProjectUsageService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  private transformProject(project: ProjectWithAccessDto | Project): ProjectWithAccessDto {
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

    let nextPage: number | undefined = query.page + 1;
    if (nextPage * query.limit >= total) {
      nextPage = undefined;
    }

    return {
      data: projects.map(this.transformProject.bind(this)),
      total,
      page: query.page,
      limit: query.limit,
      nextPage,
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
    await this.projectAccessService.ensureOwner(req.user.id, id);
    await this.projectsService.deleteOne(id);
  }

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
    const project = await this.projectsService.create(req.user.id, data);
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
    const project = await this.projectsService.updateOne(req.user.id, id, data);
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

  @Get(':id/members')
  @Auth()
  @ApiOperation({ summary: 'List project members', operationId: 'listProjectMembers' })
  @ApiResponse({ status: 200, type: ProjectMembersResponseDto })
  async listMembers(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectMembersResponseDto> {
    const project = await this.projectAccessService.ensureOwner(req.user.id, id);
    const members = await this.projectsService.listMembers(id);

    return {
      owner: project.owner,
      members,
    };
  }

  @Delete(':id/members/:memberId')
  @Auth()
  @ApiOperation({ summary: 'Remove a project member', operationId: 'removeProjectMember' })
  @ApiResponse({ status: 204 })
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<void> {
    await this.projectAccessService.ensureOwner(req.user.id, id);
    await this.projectsService.removeMember(id, memberId);
  }

  @Get(':id/invitations')
  @Auth()
  @ApiOperation({ summary: 'List project invitations', operationId: 'listProjectInvitations' })
  @ApiResponse({ status: 200, type: ProjectInvitation, isArray: true })
  async listInvitations(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectInvitation[]> {
    await this.projectAccessService.ensureOwner(req.user.id, id);
    return await this.projectsService.listProjectInvitations(id);
  }

  @Post(':id/invitations')
  @Auth()
  @ApiOperation({ summary: 'Create a project invitation', operationId: 'createProjectInvitation' })
  @ApiResponse({ status: 201, type: ProjectInvitation })
  async createInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CreateProjectInvitationDto,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.createProjectInvitation(req.user.id, id, data.invitedUserId, data.role);
  }

  @Post(':id/invitations/:invitationId/resend')
  @Auth()
  @ApiOperation({ summary: 'Resend a project invitation', operationId: 'resendProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async resendInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.resendProjectInvitation(req.user.id, id, invitationId);
  }

  @Delete(':id/invitations/:invitationId')
  @Auth()
  @ApiOperation({ summary: 'Cancel a project invitation', operationId: 'cancelProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async cancelInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.cancelProjectInvitation(req.user.id, id, invitationId);
  }
}
