import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Sse } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceUsage } from '@attraccess/database-entities';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveService } from './supervision-live.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';
import { SupervisionLiveEventDto } from './dtos/supervisionLiveEvent.dto';

@ApiTags('Resources')
@Controller('resources')
export class SupervisionController {
  constructor(
    private readonly supervisionService: SupervisionService,
    private readonly supervisionLive: SupervisionLiveService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Post(':resourceId/usage/supervision/request')
  @Auth()
  @ApiOperation({
    summary: 'Request a supervised usage session and wait (up to 30s) for supervisor approval',
    operationId: 'resourceUsageRequestSupervisedSession',
  })
  @ApiResponse({
    status: 201,
    description: 'The supervisor approved within 30 seconds and the supervised session started.',
    type: ResourceUsage,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - resource does not allow supervision or self-supervision' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'The selected supervisor is not authorized, or the request was rejected.' })
  @ApiResponse({ status: 404, description: 'Resource or supervisor not found.' })
  @ApiResponse({ status: 408, description: 'The supervisor did not respond within 30 seconds.' })
  async requestSupervisedSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: RequestSupervisedSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return this.supervisionService.requestSupervisedSession(resourceId, req.user, dto);
  }

  @Get('supervision/requests')
  @Auth()
  @ApiOperation({
    summary: 'List supervision requests awaiting the authenticated supervisor',
    operationId: 'supervisionListPendingRequests',
  })
  @ApiResponse({ status: 200, description: 'The pending supervision requests.', type: [SupervisionRequestDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async listPendingRequests(@Req() req: AuthenticatedRequest): Promise<SupervisionRequestDto[]> {
    const isResourceManager = await this.supervisionService.isResourceManager(req.user.id);
    return this.supervisionService.listPendingForSupervisor(req.user.id, isResourceManager);
  }

  @Sse('supervision/requests/live')
  @Auth()
  @ApiOperation({
    summary: 'Subscribe to live supervision requests for the authenticated supervisor',
    operationId: 'supervisionLive',
  })
  streamRequests(@Req() req: AuthenticatedRequest): Observable<{ data: SupervisionLiveEventDto }> {
    const { id: userId } = req.user;
    const subject = this.supervisionLive.getSupervisorSubject(userId);
    return this.sse.wrap(
      'supervision',
      subject.asObservable().pipe(
        finalize(() => this.supervisionLive.deleteSubjectIfUnobserved(userId)),
      ),
    );
  }

  @Post('supervision/requests/:requestId/approve')
  @Auth()
  @ApiOperation({
    summary: 'Approve a pending supervised session request',
    operationId: 'supervisionApproveRequest',
  })
  @ApiResponse({ status: 201, description: 'The supervised session started.', type: ResourceUsage })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'You are not the requested supervisor for this session.' })
  @ApiResponse({ status: 404, description: 'The request was not found or has already expired.' })
  approveRequest(
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceUsage> {
    return this.supervisionService.approve(requestId, req.user);
  }

  @Post('supervision/requests/:requestId/reject')
  @Auth()
  @ApiOperation({
    summary: 'Reject a pending supervised session request',
    operationId: 'supervisionRejectRequest',
  })
  @ApiResponse({ status: 201, description: 'The request was rejected.', type: SupervisionDecisionResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'You are not the requested supervisor for this session.' })
  @ApiResponse({ status: 404, description: 'The request was not found or has already expired.' })
  rejectRequest(
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
  ): SupervisionDecisionResponseDto {
    return this.supervisionService.reject(requestId, req.user);
  }
}
