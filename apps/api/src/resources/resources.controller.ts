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

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly resourceImageService: ResourceImageService,
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
  async createOne(@Body() createDto: CreateResourceDto, @UploadedFile() image?: FileUpload): Promise<Resource> {
    const resource = await this.resourcesService.createResource(createDto, image);
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
  @ApiOperation({ summary: 'Get all resources in use', operationId: 'getAllResourcesInUse' })
  @ApiResponse({
    status: 200,
    description: 'List of resources in use.',
    type: [Resource],
  })
  async getAllInUse(): Promise<Resource[]> {
    const resources = await this.resourcesService.listResources({
      onlyInUse: true,
      returnUsingUser: true,
    });
    return resources.data.map((resource) => this.transformResource(resource));
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
  async getOneById(@Param('id', ParseIntPipe) id: number): Promise<Resource> {
    const resource = await this.resourcesService.getResourceById(id);
    return this.transformResource(resource);
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
    @UploadedFile() image?: FileUpload,
  ): Promise<Resource> {
    const resource = await this.resourcesService.updateResource(id, updateDto, image);
    return this.transformResource(resource);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a resource', operationId: 'deleteOneResource' })
  @ApiResponse({
    status: 204,
    description: 'The resource has been successfully deleted.',
  })
  @Auth('resources.delete')
  async deleteOne(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.resourcesService.deleteResource(id);
  }
}
