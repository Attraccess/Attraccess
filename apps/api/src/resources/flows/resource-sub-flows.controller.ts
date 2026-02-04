import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceSubFlowsService } from './resource-sub-flows.service';
import { ResourceFlowNodeSchemaDto, SubFlowListResponseDto, SubFlowResponseDto, SubFlowSaveDto } from './dto';

@ApiTags('Sub Flows')
@Controller('sub-flows')
@Auth('canManageResources')
export class ResourceSubFlowsController {
  constructor(private readonly subFlowsService: ResourceSubFlowsService) {}

  @Get()
  @ApiOperation({
    summary: 'List sub-flows',
    operationId: 'listSubFlows',
  })
  @ApiResponse({ status: 200, type: SubFlowListResponseDto, isArray: true })
  async list(): Promise<SubFlowListResponseDto[]> {
    return this.subFlowsService.listSubFlows();
  }

  @Get('node-schemas')
  @ApiOperation({
    summary: 'Get sub-flow node schemas',
    operationId: 'getSubFlowNodeSchemas',
  })
  @ApiResponse({
    status: 200,
    description: 'Node schemas retrieved successfully',
    type: ResourceFlowNodeSchemaDto,
    isArray: true,
  })
  async getNodeSchemas(): Promise<ResourceFlowNodeSchemaDto[]> {
    return this.subFlowsService.getSubFlowNodeSchemas();
  }

  @Get(':subFlowId')
  @ApiOperation({
    summary: 'Get sub-flow',
    operationId: 'getSubFlow',
  })
  @ApiParam({ name: 'subFlowId', type: Number })
  @ApiResponse({ status: 200, type: SubFlowResponseDto })
  async getOne(@Param('subFlowId', ParseIntPipe) subFlowId: number): Promise<SubFlowResponseDto> {
    return this.subFlowsService.getSubFlow(subFlowId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create sub-flow',
    operationId: 'createSubFlow',
  })
  @ApiResponse({ status: 201, type: SubFlowResponseDto })
  async create(@Body() dto: SubFlowSaveDto): Promise<SubFlowResponseDto> {
    return this.subFlowsService.createSubFlow(dto);
  }

  @Put(':subFlowId')
  @ApiOperation({
    summary: 'Update sub-flow',
    operationId: 'updateSubFlow',
  })
  @ApiParam({ name: 'subFlowId', type: Number })
  @ApiResponse({ status: 200, type: SubFlowResponseDto })
  async update(
    @Param('subFlowId', ParseIntPipe) subFlowId: number,
    @Body() dto: SubFlowSaveDto,
  ): Promise<SubFlowResponseDto> {
    return this.subFlowsService.updateSubFlow(subFlowId, dto);
  }

  @Delete(':subFlowId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete sub-flow',
    operationId: 'deleteSubFlow',
  })
  @ApiParam({ name: 'subFlowId', type: Number })
  @ApiResponse({ status: 204, description: 'Sub-flow deleted' })
  async delete(@Param('subFlowId', ParseIntPipe) subFlowId: number): Promise<void> {
    await this.subFlowsService.deleteSubFlow(subFlowId);
  }
}
