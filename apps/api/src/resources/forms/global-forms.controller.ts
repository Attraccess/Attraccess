import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceFormsService } from './forms.service';
import {
  CreateFormDto,
  FormAppliedResourceDto,
  FormListQueryDto,
  FormResponseDto,
  FormSubmissionsQueryDto,
  PaginatedFormSubmissionsResponseDto,
  PaginatedFormsResponseDto,
  UpdateFormDto,
} from './dto';

/** Forms that apply to one resource, a resource group or every resource. */
@ApiTags('Forms')
@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: ResourceFormsService) {}

  @Get()
  @Auth('resources.update')
  @ApiOperation({ summary: 'List forms', operationId: 'formsList' })
  @ApiResponse({ status: 200, type: PaginatedFormsResponseDto })
  async list(@Query() query: FormListQueryDto): Promise<PaginatedFormsResponseDto> {
    return this.formsService.list(query);
  }

  @Post()
  @Auth('resources.update')
  @ApiOperation({ summary: 'Create a form', operationId: 'formsCreate' })
  @ApiResponse({ status: 201, type: FormResponseDto })
  async create(@Body() dto: CreateFormDto): Promise<FormResponseDto> {
    return this.formsService.create(dto);
  }

  @Get(':formId')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Get a form by id', operationId: 'formsGetOne' })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: FormResponseDto })
  async getOne(@Param('formId', ParseIntPipe) formId: number): Promise<FormResponseDto> {
    return this.formsService.findOne(formId);
  }

  @Put(':formId')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Update a form, moving it to another scope if asked',
    description: 'Overrides of resources the new scope no longer reaches are removed.',
    operationId: 'formsUpdate',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: FormResponseDto })
  async update(@Param('formId', ParseIntPipe) formId: number, @Body() dto: UpdateFormDto): Promise<FormResponseDto> {
    return this.formsService.update(formId, dto);
  }

  @Delete(':formId')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a form',
    description: 'The form no longer applies anywhere. Its submissions stay readable.',
    operationId: 'formsDelete',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 204, description: 'Form deleted' })
  async delete(@Param('formId', ParseIntPipe) formId: number): Promise<void> {
    await this.formsService.delete(formId);
  }

  @Get(':formId/resources')
  @Auth('resources.update')
  @ApiOperation({ summary: 'List the resources a form applies to', operationId: 'formsListResources' })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: FormAppliedResourceDto, isArray: true })
  async listResources(@Param('formId', ParseIntPipe) formId: number): Promise<FormAppliedResourceDto[]> {
    return this.formsService.listAppliedResources(formId);
  }

  @Get(':formId/submissions')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'List the submissions of a form',
    description: 'Newest first. Also works for deleted forms.',
    operationId: 'formsListSubmissions',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: PaginatedFormSubmissionsResponseDto })
  async listSubmissions(
    @Param('formId', ParseIntPipe) formId: number,
    @Query() query: FormSubmissionsQueryDto,
  ): Promise<PaginatedFormSubmissionsResponseDto> {
    return this.formsService.listSubmissions(formId, query);
  }
}
