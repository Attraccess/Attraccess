import { Controller, Get, Put, Param, Body, ParseIntPipe, Sse, Logger, Post, Req, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowsService } from './resource-flows.service';
import {
  ResourceFlowSaveDto,
  ResourceFlowResponseDto,
  ResourceFlowLogsResponseDto,
  FlowLogRecordingDto,
  StartFlowLogRecordingDto,
  ResolveResourceFlowNodeSchemaDto,
} from './dto';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { FlowLogRecorderService, ResourceFlowLogEvent } from './flow-log-recorder.service';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';

@ApiTags('Resource Flows')
@Controller('resources/:resourceId/flow')
@Auth('resources.update')
export class ResourceFlowsController {
  private readonly logger = new Logger(ResourceFlowsController.name);

  constructor(
    private readonly resourceFlowsService: ResourceFlowsService,
    private readonly resourceFlowsExecutorService: ResourceFlowsExecutorService,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly sse: SseInstrumentation,
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

  @Get('logs')
  @ApiOperation({
    summary: 'Get resource flow logs',
    description:
      'Retrieve the flow logs collected by the currently running recording, oldest first. Flow logs are never persisted: they are only collected while a recording is active and are discarded when it stops or expires.',
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
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  getResourceFlowLogs(@Param('resourceId', ParseIntPipe) resourceId: number): ResourceFlowLogsResponseDto {
    return this.flowLogs.getLogs(resourceId);
  }

  @Get('logs/recording')
  @ApiOperation({
    summary: 'Get flow log recording status',
    description:
      'Retrieve only whether a recording is currently active and when it started and expires. Cheap enough to poll: unlike the logs endpoint it never returns the collected entries.',
    operationId: 'getFlowLogRecordingStatus',
  })
  @ApiParam({ name: 'resourceId', type: 'integer', example: 1 })
  @ApiResponse({ status: 200, description: 'Recording status retrieved successfully', type: FlowLogRecordingDto })
  @ApiResponse({ status: 403, description: 'Insufficient permissions to manage resources' })
  getFlowLogRecordingStatus(@Param('resourceId', ParseIntPipe) resourceId: number): FlowLogRecordingDto {
    return this.flowLogs.getStatus(resourceId);
  }

  @Post('logs/recording')
  @ApiOperation({
    summary: 'Start recording flow logs',
    description:
      'Start collecting flow logs for this resource for the given duration (default 15 minutes, maximum 24 hours). Recording stops automatically when the duration elapses and all collected logs are discarded.',
    operationId: 'startFlowLogRecording',
  })
  @ApiParam({ name: 'resourceId', type: 'integer', example: 1 })
  @ApiBody({ type: StartFlowLogRecordingDto })
  @ApiResponse({ status: 201, description: 'Recording started', type: FlowLogRecordingDto })
  @ApiResponse({ status: 403, description: 'Insufficient permissions to manage resources' })
  startFlowLogRecording(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() body: StartFlowLogRecordingDto,
  ): FlowLogRecordingDto {
    return this.flowLogs.start(resourceId, body.durationMinutes);
  }

  @Delete('logs/recording')
  @ApiOperation({
    summary: 'Stop recording flow logs',
    description: 'Stop the running recording and discard every log collected by it.',
    operationId: 'stopFlowLogRecording',
  })
  @ApiParam({ name: 'resourceId', type: 'integer', example: 1 })
  @ApiResponse({ status: 200, description: 'Recording stopped', type: FlowLogRecordingDto })
  @ApiResponse({ status: 403, description: 'Insufficient permissions to manage resources' })
  stopFlowLogRecording(@Param('resourceId', ParseIntPipe) resourceId: number): FlowLogRecordingDto {
    return this.flowLogs.stop(resourceId);
  }

  @Sse('logs/live')
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<Observable<ResourceFlowLogEvent>> {
    this.logger.log(`Client connected to SSE for resource ${resourceId}`);

    const subject = this.flowLogs.subjectFor(resourceId);

    setTimeout(() => {
      subject.next({ data: { keepalive: true } });
    }, 100);

    return this.sse.wrap(
      'resource_flows',
      subject.asObservable().pipe(finalize(() => this.flowLogs.releaseSubject(resourceId))),
    );
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
    description: 'UNKNOWN_BUTTON_ID',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async pressButton(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('buttonId') buttonId: string,
    @Req() req: AuthenticatedRequest,
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
