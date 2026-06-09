import { ForbiddenException, Injectable, Logger, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';
import { SupervisionLiveService } from './supervision-live.service';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';

interface PendingSupervisionRequest {
  id: string;
  resourceId: number;
  requester: User;
  /**
   * The single supervisor whose approval is required (web flow, ATT-487), or `null` for a
   * reader-originated request (ATT-493) that any eligible supervisor in `eligibleSupervisorIds`
   * may approve — by tapping their card at the reader or approving the web popup.
   */
  supervisorUserId: number | null;
  /** Supervisors the request was broadcast to (reader flow); used to fan out resolution/expiry events. */
  eligibleSupervisorIds: number[];
  dto: StartUsageSessionDto;
  createdAt: Date;
  expiresAt: Date;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (session: ResourceUsage) => void;
  reject: (error: Error) => void;
  settled: boolean;
  /** Present for reader-originated requests (ATT-493); drives reader-websocket notifications. */
  readerCallbacks?: ReaderSupervisionCallbacks;
}

/**
 * Callbacks for a reader-originated supervision request. Unlike the web flow there is no blocking
 * HTTP caller — resolution side effects (notifying the reader websocket) run through these instead.
 */
export interface ReaderSupervisionCallbacks {
  onResolved: (session: ResourceUsage, supervisor: { id: number; username: string }) => void;
  onFailed: (error: Error) => void;
}

/**
 * Manages the short-lived, in-memory supervised-session approval lifecycle.
 *
 * A request is created when a user asks for a supervised session and selects a supervisor. It is
 * delivered to the supervisor in realtime (SSE) and lapses automatically after 30 seconds. The
 * requester's call resolves with the started session on approval, or rejects on timeout/rejection.
 *
 * No persistent entity is used — multiple parallel requests per supervisor are allowed without limit.
 */
@Injectable()
export class SupervisionService {
  /** A pending request lapses this many milliseconds after creation. */
  public static readonly APPROVAL_TTL_MS = 30_000;

  private readonly logger = new Logger(SupervisionService.name);
  private readonly pending = new Map<string, PendingSupervisionRequest>();

  constructor(
    private readonly resourceUsageService: ResourceUsageService,
    private readonly supervisionLive: SupervisionLiveService,
  ) {}

  /**
   * Creates a supervision request and returns a promise that resolves with the started session once
   * the supervisor approves, or rejects with a timeout/rejection error.
   */
  public async requestSupervisedSession(
    resourceId: number,
    requester: User,
    dto: RequestSupervisedSessionDto,
  ): Promise<ResourceUsage> {
    // Validate eagerly so the requester gets immediate, meaningful feedback instead of waiting 30s
    // for a request that could never have been approved (wrong supervisor, self-supervision, ...).
    await this.resourceUsageService.validateSupervisedStart(resourceId, requester, dto.supervisorUserId);

    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SupervisionService.APPROVAL_TTL_MS);

    const sessionPromise = new Promise<ResourceUsage>((resolve, reject) => {
      const timeout = setTimeout(() => this.expire(id), SupervisionService.APPROVAL_TTL_MS);
      // Don't keep the process alive solely for a pending approval.
      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }

      this.pending.set(id, {
        id,
        resourceId,
        requester,
        supervisorUserId: dto.supervisorUserId,
        eligibleSupervisorIds: [dto.supervisorUserId],
        dto,
        createdAt,
        expiresAt,
        timeout,
        resolve,
        reject,
        settled: false,
      });
    });

    const stored = this.pending.get(id);
    this.logger.debug(
      `Supervision request ${id} created for resource ${resourceId} (requester ${requester.id}, supervisor ${dto.supervisorUserId})`,
    );
    this.supervisionLive.emitToSupervisor(dto.supervisorUserId, {
      type: SupervisionLiveEventType.REQUESTED,
      requestId: id,
      request: this.toDto(stored, dto.supervisorUserId),
    });

    return sessionPromise;
  }

  /**
   * Creates a reader-originated supervision request (ATT-493). The non-introduced requester has
   * already tapped at the reader; this fans the request out to every eligible supervisor via SSE so
   * any of them can approve from their phone/PC, while the reader simultaneously waits for one of
   * them to tap their card. The first channel to resolve wins; the other is cancelled.
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
    const { resourceId, requester, dto, eligibleSupervisorIds, callbacks } = params;

    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SupervisionService.APPROVAL_TTL_MS);

    const timeout = setTimeout(() => this.expire(id), SupervisionService.APPROVAL_TTL_MS);
    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    const stored: PendingSupervisionRequest = {
      id,
      resourceId,
      requester,
      supervisorUserId: null,
      eligibleSupervisorIds,
      dto,
      createdAt,
      expiresAt,
      timeout,
      // No HTTP promise to settle for the reader flow; side effects run via readerCallbacks.
      resolve: () => undefined,
      reject: () => undefined,
      settled: false,
      readerCallbacks: callbacks,
    };
    this.pending.set(id, stored);

    this.logger.debug(
      `Reader supervision request ${id} created for resource ${resourceId} (requester ${requester.id}, ${eligibleSupervisorIds.length} eligible supervisors)`,
    );

    // Fan the request out to every eligible supervisor so any of them can approve from the web.
    for (const supervisorUserId of eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, {
        type: SupervisionLiveEventType.REQUESTED,
        requestId: id,
        request: this.toDto(stored, supervisorUserId),
      });
    }

    return { requestId: id, expiresAt };
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
    request.settled = true;
    this.clear(request);
    this.emitToEligible(request, SupervisionLiveEventType.RESOLVED);
  }

  /**
   * Cancels a reader request because the reader timed out, was disconnected, or the requester
   * aborted. Dismisses the web popups; does not invoke the reader callbacks (the reader already knows).
   */
  public cancelReaderRequest(requestId: string): void {
    const request = this.pending.get(requestId);
    if (!request) {
      return;
    }
    request.settled = true;
    this.clear(request);
    this.emitToEligible(request, SupervisionLiveEventType.EXPIRED);
  }

  /**
   * Approves a pending request: starts the supervised session via the normal start path with the
   * supervisor attached, then resolves the waiting requester.
   */
  public async approve(requestId: string, supervisor: User): Promise<ResourceUsage> {
    const request = this.getPendingForSupervisorOrThrow(requestId, supervisor);
    this.clear(request);

    try {
      const session = await this.resourceUsageService.startSession(request.resourceId, request.requester, request.dto, {
        supervisorUserId: supervisor.id,
      });
      this.fulfil(request, session);
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
  public reject(requestId: string, supervisor: User): SupervisionDecisionResponseDto {
    const request = this.getPendingForSupervisorOrThrow(requestId, supervisor);
    this.clear(request);
    const error = new ForbiddenException('The supervision request was rejected by the supervisor');
    this.fail(request, error);
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

  private getPendingForSupervisorOrThrow(requestId: string, supervisor: User): PendingSupervisionRequest {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }
    // Web flow: a single named supervisor. Reader flow (supervisorUserId === null): any of the
    // supervisors the request was broadcast to. Eligibility against the resource is re-checked by
    // startSession/validateSupervisedStart when the session actually starts.
    const allowed =
      request.supervisorUserId === null
        ? request.eligibleSupervisorIds.includes(supervisor.id)
        : request.supervisorUserId === supervisor.id;
    if (!allowed) {
      throw new ForbiddenException('You are not the requested supervisor for this session');
    }
    return request;
  }

  private expire(requestId: string): void {
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
  private emitToEligible(request: PendingSupervisionRequest, type: SupervisionLiveEventType): void {
    for (const supervisorUserId of request.eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, { type, requestId: request.id, request: null });
    }
  }

  private clear(request: PendingSupervisionRequest): void {
    clearTimeout(request.timeout);
    this.pending.delete(request.id);
  }

  private fulfil(request: PendingSupervisionRequest, session: ResourceUsage): void {
    if (request.settled) {
      return;
    }
    request.settled = true;
    request.resolve(session);
  }

  private fail(request: PendingSupervisionRequest, error: Error): void {
    if (request.settled) {
      return;
    }
    request.settled = true;
    request.reject(error);
  }

  private toDto(request: PendingSupervisionRequest, recipientSupervisorId: number): SupervisionRequestDto {
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
