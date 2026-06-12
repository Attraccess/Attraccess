import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, CsvExportTemplate } from '@attraccess/plugins-backend-sdk';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import {
  CreateCsvExportTemplateDto,
  CsvExportTemplateListQueryDto,
  UpdateCsvExportTemplateDto,
} from './dtos/csvExportTemplate.dto';

@ApiTags('Analytics')
@Controller('analytics/csv-export-templates')
export class CsvExportTemplatesController {
  public constructor(private readonly templatesService: CsvExportTemplatesService) {}

  @Get()
  @Auth('canManageResources')
  @ApiResponse({
    status: 200,
    description: 'All CSV export templates (optionally filtered by export type)',
    type: [CsvExportTemplate],
  })
  @ApiOperation({
    summary: 'List CSV export templates',
    operationId: 'getCsvExportTemplates',
  })
  public async findAll(@Query() query: CsvExportTemplateListQueryDto) {
    return this.templatesService.findAll(query.exportType);
  }

  @Get(':id')
  @Auth('canManageResources')
  @ApiResponse({
    status: 200,
    description: 'The CSV export template',
    type: CsvExportTemplate,
  })
  @ApiOperation({
    summary: 'Get a CSV export template by id',
    operationId: 'getCsvExportTemplate',
  })
  public async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @Auth('canManageResources')
  @ApiResponse({
    status: 201,
    description: 'The created CSV export template',
    type: CsvExportTemplate,
  })
  @ApiOperation({
    summary: 'Create a CSV export template',
    operationId: 'createCsvExportTemplate',
  })
  public async create(@Body() dto: CreateCsvExportTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  @Auth('canManageResources')
  @ApiResponse({
    status: 200,
    description: 'The updated CSV export template',
    type: CsvExportTemplate,
  })
  @ApiOperation({
    summary: 'Update a CSV export template',
    operationId: 'updateCsvExportTemplate',
  })
  public async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCsvExportTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @Auth('canManageResources')
  @HttpCode(204)
  @ApiResponse({
    status: 204,
    description: 'The template was deleted',
  })
  @ApiOperation({
    summary: 'Delete a CSV export template',
    operationId: 'deleteCsvExportTemplate',
  })
  public async remove(@Param('id', ParseIntPipe) id: number) {
    await this.templatesService.remove(id);
  }
}
