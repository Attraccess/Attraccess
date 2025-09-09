import { Controller, Get, Put, Param, Body, ParseIntPipe, Query, Sse, Logger, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowsService } from './resource-flows.service';
import {
  ResourceFlowSaveDto,
  ResourceFlowResponseDto,
  ResourceFlowLogsQueryDto,
  ResourceFlowLogsResponseDto,
} from './dto';
import { ResourceFlowLogEvent, ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { Observable, Subject } from 'rxjs';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';

@ApiTags('Resource Flows')
@Controller('resources/:resourceId/flow')
@Auth('canManageResources')
export class ResourceFlowsController {
  private readonly logger = new Logger(ResourceFlowsController.name);

  constructor(
    private readonly resourceFlowsService: ResourceFlowsService,
    private readonly resourceFlowsExecutorService: ResourceFlowsExecutorService
  ) {}

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
    @Param('resourceId', ParseIntPipe) resourceId: number
  ): Promise<ResourceFlowNodeSchemaDto[]> {
    return await this.resourceFlowsService.getNodeSchemas(resourceId);
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
    @Body() flowData: ResourceFlowSaveDto
  ): Promise<ResourceFlowResponseDto> {
    return await this.resourceFlowsService.saveResourceFlow(resourceId, flowData);
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Get resource flow logs',
    description:
      'Retrieve the latest execution logs for a resource flow. Logs are returned in descending order by creation time (newest first). This endpoint provides insights into flow execution, including node processing status, errors, and execution details.',
    operationId: 'getResourceFlowLogs',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource to get the flow logs for',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Resource flow logs retrieved successfully',
    type: ResourceFlowLogsResponseDto,
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
  async getResourceFlowLogs(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: ResourceFlowLogsQueryDto
  ): Promise<ResourceFlowLogsResponseDto> {
    return await this.resourceFlowsService.getResourceFlowLogs(resourceId, query.page, query.limit);
  }

  @Sse('logs/live')
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<Observable<ResourceFlowLogEvent>> {
    this.logger.log(`Client connected to SSE for resource ${resourceId}`);

    // Create a subject for this resource if it doesn't exist
    if (!this.resourceFlowsExecutorService.resourceFlowLogSubjects.has(resourceId)) {
      this.resourceFlowsExecutorService.resourceFlowLogSubjects.set(resourceId, new Subject<ResourceFlowLogEvent>());
    }

    // Get the subject for this resource
    const subject = this.resourceFlowsExecutorService.resourceFlowLogSubjects.get(resourceId);

    // Send initial state immediately
    setTimeout(async () => {
      subject.next({
        data: { keepalive: true },
      });
    }, 100);

    // Create an observable from the subject
    return subject.asObservable();
  }

  @Post('/buttons/:buttonId/press')
  @Auth()
  @ApiOperation({
    summary: 'Press a button',
    description: 'Press a button to trigger the flow',
    operationId: 'pressButton',
  })
  @ApiParam({
    name: 'buttonId',
    description: 'The ID of the button to press',
    type: 'string',
    example: 'lsHVcGBwIbOGxez5fBM68',
  })
  @ApiResponse({
    status: 200,
    description: 'Button pressed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'OK' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Button not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async pressButton(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('buttonId') buttonId: string,
    @Req() req: AuthenticatedRequest
  ) {
    await this.resourceFlowsExecutorService.pressButton(resourceId, buttonId, req.user.id);
    return 'OK';
  }

  @Get('/buttons')
  @Auth()
  @ApiOperation({
    summary: 'Get buttons',
    description: 'Get buttons for a resource',
    operationId: 'getButtons',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource to get buttons for',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Buttons retrieved successfully',
    type: ResourceFlowNode,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async getButtons(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceFlowNode[]> {
    return await this.resourceFlowsService.getNodes(resourceId, ResourceFlowNodeType.INPUT_BUTTON);
  }
}
