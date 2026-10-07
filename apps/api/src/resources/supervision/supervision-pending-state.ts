import { SupervisionService } from './supervision.service';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { ForbiddenException, RequestTimeoutException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { SupervisionRequestAdmissionImplementation } from './supervision-request-admission';
import { ReaderSupervisionCallbacks } from './supervision.service.feature-definitions';
export abstract class SupervisionPendingStateImplementation extends SupervisionRequestAdmissionImplementation {
  /**
   * Creates a reader-originated supervision request (ATT-493). The non-introduced requester has
   * already tapped at the reader; this fans the request out to every eligible supervisor via SSE.
   * Any currently authorized introducer can approve from their phone/PC, while the reader
   * simultaneously waits for one to tap their card. The first channel to resolve wins; the other
   * is cancelled.
   *
   * Unlike {@link requestSupervisedSession} there is no blocking HTTP caller — resolution is
   * surfaced through `callbacks` (which notify the reader websocket).
   */
  public createReaderRequest(params: {
    resourceId: number;
    requester: User;
    dto: StartUsageSessionDto;
    eligibleSupervisorIds: number[];
    callbacks: ReaderSupervisionCallbacks;
  }): { requestId: string; expiresAt: Date } {
    const { callbacks, ...rest } = params;

    const { id, expiresAt, promise } = this.createPending({
      ...rest,
      supervisorUserId: null,
      readerCallbacks: callbacks,
    });

    // This flow has no HTTP caller — the outcome travels via readerCallbacks — so nothing awaits the
    // promise and its rejection would surface as an unhandled one. Swallowed here rather than inside
    // createPending, so the flows that *are* awaited keep propagating normally.
    promise.catch(() => undefined);

    this.logger.debug(
      `Reader supervision request ${id} created for resource ${params.resourceId} (requester ${params.requester.id}, ${params.eligibleSupervisorIds.length} eligible supervisors)`,
    );
    this.emitRequested(id);

    return { requestId: id, expiresAt };
  }

  /**
   * Registers a pending request and arms its expiry timer.
   *
   * The returned promise is what the blocking HTTP callers await. Reader-originated requests
   * (ATT-493) have no HTTP caller and simply ignore it — their outcome travels via readerCallbacks —
   * but it is still settled, so the two flows share one lifecycle instead of two.
   */
  protected createPending(params: {
    id?: string;
    resourceId: number;
    requester: User;
    dto: StartUsageSessionDto;
    supervisorUserId: number | null;
    eligibleSupervisorIds: number[];
    readerCallbacks?: ReaderSupervisionCallbacks;
    readerId?: number;
  }): { id: string; expiresAt: Date; promise: Promise<ResourceUsage> } {
    const id = params.id ?? randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SupervisionService.APPROVAL_TTL_MS);

    const promise = new Promise<ResourceUsage>((resolve, reject) => {
      const timeout = setTimeout(() => this.expire(id), SupervisionService.APPROVAL_TTL_MS);
      // Don't keep the process alive solely for a pending approval.
      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }

      this.pending.set(id, {
        id,
        resourceId: params.resourceId,
        requester: params.requester,
        supervisorUserId: params.supervisorUserId,
        eligibleSupervisorIds: params.eligibleSupervisorIds,
        dto: params.dto,
        createdAt,
        expiresAt,
        timeout,
        resolve,
        reject,
        settled: false,
        readerCallbacks: params.readerCallbacks,
        readerId: params.readerId,
      });
    });

    return { id, expiresAt, promise };
  }

  /** Fans the initial REQUESTED event out to every supervisor who may approve the request. */
  protected emitRequested(requestId: string): void {
    const request = this.pending.get(requestId);
    if (!request) {
      return;
    }
    for (const supervisorUserId of request.eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, {
        type: SupervisionLiveEventType.REQUESTED,
        requestId,
        request: this.toDto(request, supervisorUserId),
      });
    }
  }

  /**
   * Settles a reader request because the supervisor approved it by tapping their card at the reader.
   * The session is started by the websocket session-start handler (after the on-reader crypto auth),
   * so here we only tear down the pending web request and dismiss any open web popups.
   */
  public settleByCard(requestId: string): void {
    const request = this.pending.get(requestId);
    if (!request) {
      return;
    }
    this.clear(request);
    // Fail rather than mark settled: `clear()` has just dropped the expiry timer, so a web-initiated
    // request (ATT-816) with an HTTP caller would otherwise never settle and hold the connection.
    // Failing is also the honest answer — the session that started belongs to whoever tapped at the
    // reader, not to the requester waiting here.
    this.fail(request, new ForbiddenException('Another user started a session at the reader first'));
    this.emitToEligible(request, SupervisionLiveEventType.RESOLVED);
  }

  /**
   * Cancels a reader request because the reader timed out, was disconnected, or the requester
   * aborted. Dismisses the web popups; does not invoke the reader callbacks (the reader already knows).
   */
  public cancelReaderRequest(requestId: string, reason?: string): void {
    const request = this.pending.get(requestId);
    if (!request) {
      return;
    }
    this.clear(request);
    // Fail rather than just mark settled: a web-initiated request (ATT-816) has a caller blocked on
    // this promise, and its expiry timer has just been cleared — marking it settled would hang them.
    // `reason` lets the caller hear what actually killed it instead of a generic timeout.
    this.fail(request, new RequestTimeoutException(reason ?? 'The supervision request was cancelled at the reader'));
    this.emitToEligible(request, SupervisionLiveEventType.EXPIRED);
  }
}
