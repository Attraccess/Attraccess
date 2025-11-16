import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { FileStorageService } from '../common/services/file-storage.service';
import { UpdateProjectDto } from './dto/update.dto';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly fileStorageService: FileStorageService,
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

    return {
      data: projects.map(this.transformProject.bind(this)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Get one project', operationId: 'findOneProject' })
  @ApiResponse({ status: 200, description: 'The project.', type: Project })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async getOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<Project> {
    const project = await this.projectsService.findOne({ id, ownerId: req.user.id });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.transformProject(project);
  }

  @Delete(':id')
  @Auth()
  @ApiOperation({ summary: 'Delete a project', operationId: 'deleteOneProject' })
  @ApiResponse({ status: 204, description: 'The project has been successfully deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async deleteOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    const project = await this.projectsService.findOne({ id, ownerId: req.user.id });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
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
}
