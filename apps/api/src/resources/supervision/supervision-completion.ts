import { ResourceUsage } from '@attraccess/database-entities';
import { RequestTimeoutException } from '@nestjs/common';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionApprovalImplementation } from './supervision-approval';
import { PendingSupervisionRequest } from './supervision.service.feature-definitions';
export abstract class SupervisionCompletionImplementation extends SupervisionApprovalImplementation {
  protected expire(requestId: string): void {
    const request = this.pending.get(requestId);
    if (!request) {
      return;
    }
    this.clear(request);
    this.logger.debug(`Supervision request ${requestId} expired`);
    const error = new RequestTimeoutException('Supervision request expired before the supervisor responded');
    this.fail(request, error);
    request.readerCallbacks?.onFailed(error);
    this.emitToEligible(request, SupervisionLiveEventType.EXPIRED);
  }

  /** Fans a terminal (non-REQUESTED) live event out to every supervisor the request reached. */
  protected emitToEligible(request: PendingSupervisionRequest, type: SupervisionLiveEventType): void {
    for (const supervisorUserId of request.eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, { type, requestId: request.id, request: null });
    }
  }

  protected clear(request: PendingSupervisionRequest): void {
    clearTimeout(request.timeout);
    this.pending.delete(request.id);
  }

  protected fulfil(request: PendingSupervisionRequest, session: ResourceUsage): void {
    if (request.settled) {
      return;
    }
    request.settled = true;
    request.resolve(session);
  }

  protected fail(request: PendingSupervisionRequest, error: Error): void {
    if (request.settled) {
      return;
    }
    request.settled = true;
    request.reject(error);
  }

  protected toDto(request: PendingSupervisionRequest, recipientSupervisorId: number): SupervisionRequestDto {
    return {
      id: request.id,
      resourceId: request.resourceId,
      requesterUserId: request.requester.id,
      requesterUsername: request.requester.username,
      // For reader requests (no single named supervisor) report the recipient so the web popup
      // shows up consistently for whoever received it.
      supervisorUserId: request.supervisorUserId ?? recipientSupervisorId,
      notes: request.dto.notes ?? null,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    };
  }
}
