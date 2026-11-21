import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceFormsService } from './forms.service';
import { FormRequirementsQueryDto, FormResourceOverrideDto, FormResponseDto, ResourceApplicableFormDto } from './dto';

/** The forms that apply to one resource and how the resource deviates from them. */
@ApiTags('Forms')
@Controller('resources/:resourceId/forms')
export class ResourceFormsController {
  constructor(private readonly resourceFormsService: ResourceFormsService) {}

  @Get()
  @Auth('resources.update')
  @ApiOperation({
    summary: 'List the forms that apply to a resource',
    description: 'Its own forms and those it inherits from its groups and global forms, switched-off ones included.',
    operationId: 'resourceFormsList',
  })
  @ApiResponse({ status: 200, type: ResourceApplicableFormDto, isArray: true })
  async list(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceApplicableFormDto[]> {
    return this.resourceFormsService.listForResource(resourceId);
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

  @Put(':formId/override')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Switch a form off for a resource or override its required flags',
    operationId: 'resourceFormsSetOverride',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 200, type: ResourceApplicableFormDto })
  async setOverride(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: FormResourceOverrideDto,
  ): Promise<ResourceApplicableFormDto> {
    return this.resourceFormsService.upsertOverride(resourceId, formId, dto);
  }

  @Delete(':formId/override')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({
    summary: "Remove a resource's override of a form, so the form's defaults apply again",
    operationId: 'resourceFormsDeleteOverride',
  })
  @ApiParam({ name: 'formId', type: Number })
  @ApiResponse({ status: 204, description: 'Override removed' })
  async deleteOverride(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ): Promise<void> {
    await this.resourceFormsService.deleteOverride(resourceId, formId);
  }
}
