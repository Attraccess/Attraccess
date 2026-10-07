import { ResourceUsage, User } from '@attraccess/database-entities';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionPendingStateImplementation } from './supervision-pending-state';
import { PendingSupervisionRequest } from './supervision.service.feature-definitions';
export abstract class SupervisionApprovalImplementation extends SupervisionPendingStateImplementation {
  /**
   * Approves a pending request: starts the supervised session via the normal start path with the
   * supervisor attached, then resolves the waiting requester.
   */
  public async approve(
    requestId: string,
    supervisor: User,
    authenticationMethod: 'session' | 'api-token' | null = 'session',
    apiTokenId?: number,
  ): Promise<ResourceUsage> {
    const request = this.getPendingForSupervisorOrThrow(requestId, supervisor, { allowAnyAuthorized: true });
    await this.assertMayApprove(request, supervisor);

    // assertMayApprove can hit the DB, which is long enough for the 30s timer to fire underneath us.
    // Without this the request would already be failed and reported as such to both the requester
    // and the reader, while startSession below still opened a real session on a physical machine.
    if (this.pending.get(requestId) !== request || request.settled) {
      throw new NotFoundException('Supervision request not found or already expired');
    }

    this.clear(request);

    try {
      const session = await this.resourceUsageService.startSession(request.resourceId, request.requester, request.dto, {
        supervisorUserId: supervisor.id,
        auditOrigin: {
          actorId: supervisor.id,
          authenticationMethod,
          ...(apiTokenId === undefined ? {} : { apiTokenId }),
        },
      });
      this.fulfil(request, session);
      void this.audit.recordResource({
        action: 'supervision.approved',
        actorId: supervisor.id,
        authenticationMethod,
        apiTokenId,
        subjectId: request.resourceId,
        details: {
          requestId: request.id,
          requesterUserId: request.requester.id,
          supervisorUserId: supervisor.id,
        },
      });
      // Reader-originated requests surface the result to the reader websocket; the session was just
      // started here (the web popup won the race against an on-reader card tap).
      request.readerCallbacks?.onResolved(session, { id: supervisor.id, username: supervisor.username });
      this.emitToEligible(request, SupervisionLiveEventType.RESOLVED);
      return session;
    } catch (error) {
      // Surface the failure to both the supervisor (HTTP error) and the waiting requester.
      this.fail(request, error as Error);
      request.readerCallbacks?.onFailed(error as Error);
      throw error;
    }
  }

  /**
   * Rejects a pending request: the waiting requester is failed with a Forbidden error.
   */
  public reject(
    requestId: string,
    supervisor: User,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): SupervisionDecisionResponseDto {
    const request = this.getPendingForSupervisorOrThrow(requestId, supervisor);
    this.clear(request);
    const error = new ForbiddenException('The supervision request was rejected by the supervisor');
    this.fail(request, error);
    void this.audit.recordResource({
      action: 'supervision.rejected',
      actorId: supervisor.id,
      authenticationMethod,
      apiTokenId,
      subjectId: request.resourceId,
      details: {
        requestId: request.id,
        requesterUserId: request.requester.id,
        supervisorUserId: supervisor.id,
      },
    });
    request.readerCallbacks?.onFailed(error);
    this.emitToEligible(request, SupervisionLiveEventType.REJECTED);
    return { status: 'rejected', requestId };
  }

  /**
   * Lists the requests currently awaiting a given supervisor (used for SSE reconnect/initial state).
   */
  public listPendingForSupervisor(supervisorUserId: number): SupervisionRequestDto[] {
    const requests: SupervisionRequestDto[] = [];
    for (const request of this.pending.values()) {
      const targetsSupervisor =
        request.supervisorUserId === null
          ? request.eligibleSupervisorIds.includes(supervisorUserId)
          : request.supervisorUserId === supervisorUserId;
      if (targetsSupervisor) {
        requests.push(this.toDto(request, supervisorUserId));
      }
    }
    return requests;
  }

  protected getPendingForSupervisorOrThrow(
    requestId: string,
    supervisor: User,
    opts: { allowAnyAuthorized?: boolean } = {},
  ): PendingSupervisionRequest {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }
    const allowed =
      request.supervisorUserId === null
        ? opts.allowAnyAuthorized || request.eligibleSupervisorIds.includes(supervisor.id)
        : request.supervisorUserId === supervisor.id;
    if (!allowed) {
      throw new ForbiddenException('You are not the requested supervisor for this session');
    }
    return request;
  }

  /**
   * Broadcast requests are revalidated against the current introducer grants. This admits an
   * introducer granted access after the request was broadcast, without admitting maintainers or
   * resource managers. Named requests are revalidated by startSession immediately before creation.
   */
  protected async assertMayApprove(request: PendingSupervisionRequest, supervisor: User): Promise<void> {
    if (request.supervisorUserId !== null) {
      return;
    }
    try {
      await this.resourceUsageService.validateSupervisedStart(request.resourceId, request.requester, supervisor.id);
    } catch {
      throw new ForbiddenException('You are not authorized to supervise this session');
    }
  }
}
