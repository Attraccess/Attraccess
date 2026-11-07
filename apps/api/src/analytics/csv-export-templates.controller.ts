import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAny } from '@attraccess/plugins-backend-sdk';
import { CsvExportTemplate } from '@attraccess/database-entities';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import {
  CreateCsvExportTemplateDto,
  CsvExportTemplateListQueryDto,
  UpdateCsvExportTemplateDto,
} from './dtos/csvExportTemplate.dto';

// Same permission set as the /csv-export frontend route. Templates are shared instance-wide.
@ApiTags('Analytics')
@Controller('analytics/csv-export-templates')
export class CsvExportTemplatesController {
  public constructor(private readonly templatesService: CsvExportTemplatesService) {}

  @Get()
  @AuthAny('resources.reports.export', 'billing.manage')
  @ApiResponse({
    status: 200,
    description: 'All CSV export templates (optionally filtered by export type)',
    type: [CsvExportTemplate],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires resources.reports.export or billing.manage' })
  @ApiOperation({
    summary: 'List CSV export templates',
    operationId: 'getCsvExportTemplates',
  })
  public async findAll(@Query() query: CsvExportTemplateListQueryDto) {
    return this.templatesService.findAll(query.exportType);
  }

  @Get(':id')
  @AuthAny('resources.reports.export', 'billing.manage')
  @ApiResponse({
    status: 200,
    description: 'The CSV export template',
    type: CsvExportTemplate,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires resources.reports.export or billing.manage' })
  @ApiResponse({ status: 404, description: 'CSV export template not found' })
  @ApiOperation({
    summary: 'Get a CSV export template by id',
    operationId: 'getCsvExportTemplate',
  })
  public async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @AuthAny('resources.reports.export', 'billing.manage')
  @ApiResponse({
    status: 201,
    description: 'The created CSV export template',
    type: CsvExportTemplate,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires resources.reports.export or billing.manage' })
  @ApiResponse({ status: 409, description: 'A template with this name already exists for the export type' })
  @ApiOperation({
    summary: 'Create a CSV export template',
    operationId: 'createCsvExportTemplate',
  })
  public async create(@Body() dto: CreateCsvExportTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  @AuthAny('resources.reports.export', 'billing.manage')
  @ApiResponse({
    status: 200,
    description: 'The updated CSV export template',
    type: CsvExportTemplate,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires resources.reports.export or billing.manage' })
  @ApiResponse({ status: 404, description: 'CSV export template not found' })
  @ApiResponse({ status: 409, description: 'A template with this name already exists for the export type' })
  @ApiOperation({
    summary: 'Update a CSV export template',
    operationId: 'updateCsvExportTemplate',
  })
  public async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCsvExportTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @AuthAny('resources.reports.export', 'billing.manage')
  @HttpCode(204)
  @ApiResponse({
    status: 204,
    description: 'The template was deleted',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires resources.reports.export or billing.manage' })
  @ApiResponse({ status: 404, description: 'CSV export template not found' })
  @ApiOperation({
    summary: 'Delete a CSV export template',
    operationId: 'deleteCsvExportTemplate',
  })
  public async remove(@Param('id', ParseIntPipe) id: number) {
    await this.templatesService.remove(id);
  }
}
