import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceFormsService } from './forms.service';
import { CreateFormDto, FormRequirementsQueryDto, FormResponseDto, UpdateFormDto } from './dto';

@ApiTags('Resource Forms')
@Controller('resources/:resourceId/forms')
export class ResourceFormsController {
  constructor(private readonly resourceFormsService: ResourceFormsService) {}

  @Get()
  @Auth('resources.update')
  @ApiOperation({
    summary: 'List forms for a resource',
    operationId: 'resourceFormsList',
  })
  @ApiResponse({ status: 200, type: FormResponseDto, isArray: true })
  async list(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<FormResponseDto[]> {
    return this.resourceFormsService.findAll(resourceId);
  }

  @Post()
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Create a form',
    operationId: 'resourceFormsCreate',
  })
  @ApiResponse({ status: 201, type: FormResponseDto })
  async create(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateFormDto,
  ): Promise<FormResponseDto> {
    return this.resourceFormsService.create(resourceId, dto);
  }

  @Get('requirements')
  @Auth()
  @ApiOperation({
    summary: 'Get required forms for a resource action',
    operationId: 'resourceFormsGetRequirements',
  })
  @ApiResponse({ status: 200, type: FormResponseDto, isArray: true })
  async getRequirements(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: FormRequirementsQueryDto,
  ): Promise<FormResponseDto[]> {
    return this.resourceFormsService.getFormsForAction(resourceId, query.action);
  }

  @Get(':formId')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Get a form by id',
    operationId: 'resourceFormsGetOne',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: FormResponseDto })
  async getOne(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ): Promise<FormResponseDto> {
    return this.resourceFormsService.findOne(resourceId, formId);
  }

  @Put(':formId')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Update a form',
    operationId: 'resourceFormsUpdate',
  })
  @ApiResponse({ status: 200, type: FormResponseDto })
  async update(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: UpdateFormDto,
  ): Promise<FormResponseDto> {
    return this.resourceFormsService.update(resourceId, formId, dto);
  }

  @Delete(':formId')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a form',
    operationId: 'resourceFormsDelete',
  })
  @ApiResponse({ status: 204, description: 'Form deleted' })
  async delete(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ): Promise<void> {
    await this.resourceFormsService.delete(resourceId, formId);
  }
}
