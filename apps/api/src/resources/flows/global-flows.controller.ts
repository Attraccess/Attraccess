import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { auditActorOf } from '../../audit/recorder/audit-event';
import { Body, Controller, Delete, Get, Logger, Param, ParseIntPipe, Patch, Post, Put, Req, Sse } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import {
  CreateGlobalFlowDto,
  FlowLogRecordingDto,
  GlobalFlowDto,
  GlobalFlowSummaryDto,
  ResolveResourceFlowNodeSchemaDto,
  ResourceFlowLogsResponseDto,
  ResourceFlowResponseDto,
  ResourceFlowSaveDto,
  StartFlowLogRecordingDto,
  UpdateGlobalFlowDto,
} from './dto/index';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { GlobalFlowsService } from './global-flows.service';
import { FlowLogRecorderService, globalFlowLogKey, ResourceFlowLogEvent } from './logs/flow-log-recorder.service';

@ApiTags('Global Flows')
@Controller('flows')
@Auth('resources.update')
@ApiResponse({ status: 403, description: 'Insufficient permissions to manage resources' })
export class GlobalFlowsController {
  private readonly logger = new Logger(GlobalFlowsController.name);

  constructor(
    private readonly globalFlows: GlobalFlowsService,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List global flows', operationId: 'listGlobalFlows' })
  @ApiResponse({ status: 200, type: GlobalFlowSummaryDto, isArray: true })
  list(): Promise<GlobalFlowSummaryDto[]> {
    return this.globalFlows.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a global flow', operationId: 'createGlobalFlow' })
  @ApiResponse({ status: 201, type: GlobalFlowDto })
  create(@Body() body: CreateGlobalFlowDto, @Req() req: AuthenticatedRequest): Promise<GlobalFlowDto> {
    return this.globalFlows.create(body, auditActorOf(req.user));
  }

  @Get('node-schemas')
  @ApiOperation({
    summary: 'Get node schemas for global flows',
    description:
      'All node types, core and plugin. Check supportedFlowScopes for "global" to see which can be used in a global flow.',
    operationId: 'getGlobalFlowNodeSchemas',
  })
  @ApiResponse({ status: 200, type: ResourceFlowNodeSchemaDto, isArray: true })
  getNodeSchemas(): Promise<ResourceFlowNodeSchemaDto[]> {
    return this.globalFlows.getNodeSchemas();
  }

  @Get(':flowId')
  @ApiOperation({ summary: 'Get a global flow', operationId: 'getGlobalFlow' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: GlobalFlowDto })
  @ApiResponse({ status: 404, description: 'Flow not found' })
  get(@Param('flowId', ParseIntPipe) flowId: number): Promise<GlobalFlowDto> {
    return this.globalFlows.get(flowId);
  }

  @Patch(':flowId')
  @ApiOperation({
    summary: 'Update a global flow',
    description:
      'Change name, description or the on/off switch. Runs already in progress finish when a flow is turned off.',
    operationId: 'updateGlobalFlow',
  })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: GlobalFlowDto })
  update(
    @Param('flowId', ParseIntPipe) flowId: number,
    @Body() body: UpdateGlobalFlowDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GlobalFlowDto> {
    return this.globalFlows.update(flowId, body, auditActorOf(req.user));
  }

  @Delete(':flowId')
  @ApiOperation({ summary: 'Delete a global flow with its nodes and edges', operationId: 'deleteGlobalFlow' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async delete(@Param('flowId', ParseIntPipe) flowId: number, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.globalFlows.delete(flowId, auditActorOf(req.user));
  }

  @Get(':flowId/canvas')
  @ApiOperation({ summary: 'Get the canvas of a global flow', operationId: 'getGlobalFlowCanvas' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: ResourceFlowResponseDto })
  getCanvas(@Param('flowId', ParseIntPipe) flowId: number): Promise<ResourceFlowResponseDto> {
    return this.globalFlows.getCanvas(flowId);
  }

  @Put(':flowId/canvas')
  @ApiOperation({
    summary: 'Save the canvas of a global flow',
    description:
      'Replaces all nodes and edges. Fails with 400 naming the node when a node cannot be used in global flows.',
    operationId: 'saveGlobalFlowCanvas',
  })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: ResourceFlowResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data or unsupported node' })
  saveCanvas(
    @Param('flowId', ParseIntPipe) flowId: number,
    @Body() body: ResourceFlowSaveDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceFlowResponseDto> {
    return this.globalFlows.saveCanvas(flowId, body, auditActorOf(req.user));
  }

  @Post(':flowId/node-schemas/:nodeType')
  @ApiOperation({
    summary: 'Resolve a plugin flow-node schema in a global flow',
    operationId: 'resolveGlobalFlowNodeSchema',
  })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 201, type: ResourceFlowNodeSchemaDto })
  resolveNodeSchema(
    @Param('flowId', ParseIntPipe) flowId: number,
    @Param('nodeType') nodeType: string,
    @Body() body: ResolveResourceFlowNodeSchemaDto,
  ): Promise<ResourceFlowNodeSchemaDto> {
    return this.globalFlows.resolveNodeSchema(flowId, nodeType, body.config);
  }

  @Post(':flowId/node-previews/:nodeType')
  @ApiOperation({
    summary: 'Resolve a plugin flow-node preview in a global flow',
    operationId: 'resolveGlobalFlowNodePreview',
  })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 201, type: ResourceFlowNodeSchemaDto })
  resolveNodePreview(
    @Param('flowId', ParseIntPipe) flowId: number,
    @Param('nodeType') nodeType: string,
    @Body() body: ResolveResourceFlowNodeSchemaDto,
  ): Promise<ResourceFlowNodeSchemaDto> {
    return this.globalFlows.resolveNodeSchema(flowId, nodeType, body.config, 'preview');
  }

  @Get(':flowId/logs')
  @ApiOperation({ summary: 'Get global flow logs', operationId: 'getGlobalFlowLogs' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: ResourceFlowLogsResponseDto })
  async getLogs(@Param('flowId', ParseIntPipe) flowId: number): Promise<ResourceFlowLogsResponseDto> {
    await this.globalFlows.get(flowId);
    return this.flowLogs.getLogs(globalFlowLogKey(flowId));
  }

  @Get(':flowId/logs/recording')
  @ApiOperation({ summary: 'Get global flow log recording status', operationId: 'getGlobalFlowLogRecordingStatus' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: FlowLogRecordingDto })
  async getRecording(@Param('flowId', ParseIntPipe) flowId: number): Promise<FlowLogRecordingDto> {
    await this.globalFlows.get(flowId);
    return this.flowLogs.getStatus(globalFlowLogKey(flowId));
  }

  @Post(':flowId/logs/recording')
  @ApiOperation({ summary: 'Start recording global flow logs', operationId: 'startGlobalFlowLogRecording' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiBody({ type: StartFlowLogRecordingDto })
  @ApiResponse({ status: 201, type: FlowLogRecordingDto })
  async startRecording(
    @Param('flowId', ParseIntPipe) flowId: number,
    @Body() body: StartFlowLogRecordingDto,
  ): Promise<FlowLogRecordingDto> {
    await this.globalFlows.get(flowId);
    return this.flowLogs.start(globalFlowLogKey(flowId), body.durationMinutes);
  }

  @Delete(':flowId/logs/recording')
  @ApiOperation({ summary: 'Stop recording global flow logs', operationId: 'stopGlobalFlowLogRecording' })
  @ApiParam({ name: 'flowId', type: 'integer' })
  @ApiResponse({ status: 200, type: FlowLogRecordingDto })
  async stopRecording(@Param('flowId', ParseIntPipe) flowId: number): Promise<FlowLogRecordingDto> {
    await this.globalFlows.get(flowId);
    return this.flowLogs.stop(globalFlowLogKey(flowId));
  }

  @Sse(':flowId/logs/live')
  async streamEvents(@Param('flowId', ParseIntPipe) flowId: number): Promise<Observable<ResourceFlowLogEvent>> {
    await this.globalFlows.get(flowId);
    this.logger.log(`Client connected to SSE for global flow ${flowId}`);
    const key = globalFlowLogKey(flowId);
    const subject = this.flowLogs.subjectFor(key);
    setTimeout(() => subject.next({ data: { keepalive: true } }), 100);
    return this.sse.wrap(
      'resource_flows',
      subject.asObservable().pipe(finalize(() => this.flowLogs.releaseSubject(key))),
    );
  }
}
