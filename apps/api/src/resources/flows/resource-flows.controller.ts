import { Auth } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Delete, Get, Logger, Param, ParseIntPipe, Post, Sse } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { FlowLogRecordingDto, ResourceFlowLogsResponseDto, StartFlowLogRecordingDto } from './dto';
import { FlowLogRecorderService, ResourceFlowLogEvent } from './flow-log-recorder.service';
import { ResourceFlowButtonsRoutes } from './resource-flow-buttons.routes';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowsService } from './resource-flows.service';
import { installInheritedMethods } from '../../common/inherited-implementation';

@ApiTags('Resource Flows')
@Controller('resources/:resourceId/flow')
@Auth('resources.update')
export class ResourceFlowsController extends ResourceFlowButtonsRoutes {
  protected readonly logger = new Logger(ResourceFlowsController.name);

  constructor(
    protected readonly resourceFlowsService: ResourceFlowsService,
    protected readonly resourceFlowsExecutorService: ResourceFlowsExecutorService,
    protected readonly flowLogs: FlowLogRecorderService,
    protected readonly sse: SseInstrumentation,
  ) {
    super();
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
}
installInheritedMethods(ResourceFlowsController, [
  'getNodeSchemas',
  'resolveNodeSchema',
  'resolveNodePreview',
  'getResourceFlow',
  'saveResourceFlow',
  'getResourceFlowLogs',
  'getFlowLogRecordingStatus',
  'startFlowLogRecording',
  'stopFlowLogRecording',
  'streamEvents',
  'pressButton',
  'getButtons',
]);
