import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { ResourcesService } from './resources.service';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { CreateResourceDto } from './dtos/createResource.dto';
import { ListResourcesDto } from './dtos/listResources.dto';
import { Resource } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PaginatedResponse } from '../types/response';
import { FileUpload } from '../common/types/file-upload.types';
import { PaginatedResourceResponseDto } from './dtos/paginatedResourceResponse.dto';
import { ResourceImageService } from './resourceImage.service';
import { ResourceActivityVisibilityService } from './usage/authorization/resource-activity-visibility.service';
import { ResourceIntroducersService } from './introducers/resourceIntroducers.service';
import { isActiveUsage } from './usage/sessions/active-usage';

const IN_USE_PAGE_SIZE = 100;

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly resourceImageService: ResourceImageService,
    private readonly activityVisibility: ResourceActivityVisibilityService,
    private readonly introducers: ResourceIntroducersService,
  ) {}

  private transformResource(resource: Resource): Resource {
    return {
      ...resource,
      imageFilename: resource.imageFilename
        ? this.resourceImageService.getPublicPath(resource.id, resource.imageFilename)
        : null,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new resource', operationId: 'createOneResource' })
  @ApiResponse({
    status: 201,
    description: 'The resource has been successfully created.',
    type: Resource,
  })
  @Auth('resources.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async createOne(
    @Body() createDto: CreateResourceDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() image?: FileUpload,
  ): Promise<Resource> {
    const resource = await this.resourcesService.createResource(createDto, image, req.user);
    return this.transformResource(resource);
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all resources', operationId: 'getAllResources' })
  @ApiResponse({
    status: 200,
    description: 'List of resources with pagination.',
    type: PaginatedResourceResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  async getAll(
    @Query() query: ListResourcesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaginatedResponse<Resource>> {
    let onlyWithPermissionForUserId: number | undefined;

    if (!req.user.effectivePermissions?.has('resources.update')) {
      if (query.onlyWithPermissions === true) {
        onlyWithPermissionForUserId = req.user.id;
      }
    }

    const resources = await this.resourcesService.listResources({
      page: query.page,
      limit: query.limit,
      search: query.search,
      groupId: query.groupId,
      onlyInUseByUserId: query.onlyInUseByMe ? req.user.id : undefined,
      onlyWithPermissionForUserId,
    });

    resources.data = resources.data.map((resource) => {
      return this.transformResource(resource);
    });
    return resources;
  }

  @Get('in-use')
  @Auth()
  @ApiOperation({ summary: 'Get all resources in use', operationId: 'getAllResourcesInUse' })
  @ApiResponse({
    status: 200,
    description: 'List of resources in use.',
    type: [Resource],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  async getAllInUse(@Req() req: AuthenticatedRequest): Promise<Resource[]> {
    // Every in-use machine, not one page: the visibility filter below would otherwise drop machines past the first page.
    const inUse: Resource[] = [];
    for (let page = 1; ; page++) {
      const { data, total } = await this.resourcesService.listResources({
        onlyInUse: true,
        returnUsingUser: true,
        page,
        limit: IN_USE_PAGE_SIZE,
      });
      inUse.push(...data);
      if (data.length === 0 || page * IN_USE_PAGE_SIZE >= total) break;
    }
    const access = await this.activityVisibility.resolveMany(
      req.user,
      inUse.map((resource) => resource.id),
    );
    // Machines the viewer may not see activity for are left out: they have no in-use entry for this viewer.
    return this.activityVisibility
      .applyToResources(inUse, access, req.user.id)
      .filter((resource) => resource.usages.length > 0)
      .map((resource) => this.transformResource(resource));
  }

  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Get a resource by ID', operationId: 'getOneResourceById' })
  @ApiResponse({
    status: 200,
    description: 'The found resource.',
    type: Resource,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async getOneById(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<Resource> {
    const resource = await this.resourcesService.getResourceById(id);
    // Only the current session is embedded; past sessions are read through usage/history, which has its own rule.
    resource.usages = (resource.usages ?? []).filter(isActiveUsage);
    const access = await this.activityVisibility.resolveMany(req.user, [id]);
    const [visible] = this.activityVisibility.applyToResources([resource], access, req.user.id);
    // The embedded introductions are the full access list; they follow the same rule as the People tab.
    const introductions = (await this.introducers.canViewAccessLists(id, req.user)) ? visible.introductions : [];
    return this.transformResource({ ...visible, introductions });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a resource', operationId: 'updateOneResource' })
  @ApiResponse({
    status: 200,
    description: 'The resource has been successfully updated.',
    type: Resource,
  })
  @Auth('resources.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateResourceDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() image?: FileUpload,
  ): Promise<Resource> {
    const resource = await this.resourcesService.updateResource(id, updateDto, image, req.user);
    return this.transformResource(resource);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a resource', operationId: 'deleteOneResource' })
  @ApiResponse({
    status: 204,
    description: 'The resource has been successfully deleted.',
  })
  @Auth('resources.delete')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.resourcesService.deleteResource(id, req.user);
  }
}
