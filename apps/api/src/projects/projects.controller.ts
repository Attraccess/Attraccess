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

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly fileStorageService: FileStorageService,
    private readonly projectUsageService: ProjectUsageService,
  ) {}

  private transformProject(project: Project): Project {
    return {
      ...project,
      logo: project.logo ? this.fileStorageService.getPublicPath(`projects/${project.id}`, project.logo) : null,
    };
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
    const total = await this.projectsService.getTotalCount(req.user.id);

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
  @ApiResponse({ status: 200, description: 'The project.', type: Project })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async getOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<Project> {
    const project = await this.projectsService.findOneById(req.user.id, id);
    return this.transformProject(project);
  }

  @Delete(':id')
  @Auth()
  @ApiOperation({ summary: 'Delete a project', operationId: 'deleteOneProject' })
  @ApiResponse({ status: 204, description: 'The project has been successfully deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async deleteOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    const project = await this.projectsService.findOneById(req.user.id, id);
    await this.projectsService.deleteOne(project.id);
  }

  @Post()
  @Auth()
  @ApiOperation({ summary: 'Create a project', operationId: 'createProject' })
  @ApiResponse({ status: 201, description: 'The project was created successfully.', type: Project })
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
    return this.transformProject(project);
  }

  @Put(':id')
  @Auth()
  @ApiOperation({ summary: 'Update a project', operationId: 'updateProject' })
  @ApiResponse({ status: 200, description: 'The project was updated successfully.', type: Project })
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
    return this.transformProject(project);
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
    await this.projectsService.findOneById(req.user.id, id);
    return await this.projectUsageService.getProjectUsageHistory(id, query);
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
    await this.projectsService.findOneById(req.user.id, id);
    return await this.projectUsageService.getProjectUsageStats(id, query);
  }
}
