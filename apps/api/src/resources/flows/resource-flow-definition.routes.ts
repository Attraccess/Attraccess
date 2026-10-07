import { Body, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ResolveResourceFlowNodeSchemaDto, ResourceFlowResponseDto, ResourceFlowSaveDto } from './dto';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { ResourceFlowsControllerRouteContext } from './resource-flows.controller.route-context';
export abstract class ResourceFlowDefinitionRoutes extends ResourceFlowsControllerRouteContext {
  @Get('node-schemas')
  @ApiOperation({
    summary: 'Get node schemas',
    description: 'Get the schemas for all node types',
    operationId: 'getNodeSchemas',
  })
  @ApiResponse({
    status: 200,
    description: 'Node schemas retrieved successfully',
    type: ResourceFlowNodeSchemaDto,
    isArray: true,
  })
  public async getNodeSchemas(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceFlowNodeSchemaDto[]> {
    return await this.resourceFlowsService.getNodeSchemas(resourceId);
  }

  @Post('node-schemas/:nodeType')
  @ApiOperation({
    summary: 'Resolve a plugin flow-node schema',
    description: 'Build a plugin flow-node configuration schema from the current configuration.',
    operationId: 'resolveNodeSchema',
  })
  @ApiResponse({ status: 201, description: 'Node schema resolved successfully', type: ResourceFlowNodeSchemaDto })
  public async resolveNodeSchema(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('nodeType') nodeType: string,
    @Body() body: ResolveResourceFlowNodeSchemaDto,
  ): Promise<ResourceFlowNodeSchemaDto> {
    return await this.resourceFlowsService.resolveNodeSchema(resourceId, nodeType, body.config);
  }

  @Post('node-previews/:nodeType')
  @ApiOperation({
    summary: 'Resolve a plugin flow-node preview',
    description: 'Resolve a canvas summary without editor-only schema lookups.',
    operationId: 'resolveNodePreview',
  })
  @ApiResponse({ status: 201, description: 'Node preview resolved successfully', type: ResourceFlowNodeSchemaDto })
  public async resolveNodePreview(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('nodeType') nodeType: string,
    @Body() body: ResolveResourceFlowNodeSchemaDto,
  ): Promise<ResourceFlowNodeSchemaDto> {
    return await this.resourceFlowsService.resolveNodeSchema(resourceId, nodeType, body.config, 'preview');
  }

  @Get()
  @ApiOperation({
    summary: 'Get resource flow',
    description:
      'Retrieve the complete flow configuration for a resource, including all nodes and edges. This endpoint returns the workflow definition that determines what actions are triggered when resource usage events occur.',
    operationId: 'getResourceFlow',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource to get the flow for',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Resource flow retrieved successfully',
    type: ResourceFlowResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Resource not found' },
        statusCode: { type: 'number', example: 404 },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async getResourceFlow(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceFlowResponseDto> {
    return await this.resourceFlowsService.getResourceFlow(resourceId);
  }

  @Put()
  @ApiOperation({
    summary: 'Save resource flow',
    description:
      'Save the complete flow configuration for a resource. This will replace all existing nodes and edges. The flow defines what actions (HTTP requests, MQTT messages, etc.) are triggered when resource usage events occur.',
    operationId: 'saveResourceFlow',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource to save the flow for',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description:
      'Resource flow saved successfully. May include validation errors for individual nodes that have invalid configuration.',
    type: ResourceFlowResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'array', items: { type: 'string' }, example: ['nodes must be an array'] },
        statusCode: { type: 'number', example: 400 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Resource not found' },
        statusCode: { type: 'number', example: 404 },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async saveResourceFlow(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() flowData: ResourceFlowSaveDto,
  ): Promise<ResourceFlowResponseDto> {
    return await this.resourceFlowsService.saveResourceFlow(resourceId, flowData);
  }
}
