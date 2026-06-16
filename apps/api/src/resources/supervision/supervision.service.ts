import { ForbiddenException, Injectable, Logger, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';
import { SupervisionLiveService } from './supervision-live.service';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';

interface PendingSupervisionRequest {
  id: string;
  resourceId: number;
  requester: User;
  supervisorUserId: number;
  dto: RequestSupervisedSessionDto;
  createdAt: Date;
  expiresAt: Date;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (session: ResourceUsage) => void;
  reject: (error: Error) => void;
  settled: boolean;
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
      request: this.toDto(stored),
    });
    return sessionPromise;
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
      this.supervisionLive.emitToSupervisor(supervisor.id, {
        type: SupervisionLiveEventType.RESOLVED,
        requestId,
        request: null,
      });
      return session;
    } catch (error) {
      // Surface the failure to both the supervisor (HTTP error) and the waiting requester.
      this.fail(request, error as Error);
      throw error;
    }
  }

  /**
   * Rejects a pending request: the waiting requester is failed with a Forbidden error.
   */
  public reject(requestId: string, supervisor: User): SupervisionDecisionResponseDto {
    const request = this.getPendingForSupervisorOrThrow(requestId, supervisor);
    this.clear(request);
    this.fail(request, new ForbiddenException('The supervision request was rejected by the supervisor'));
    this.supervisionLive.emitToSupervisor(supervisor.id, {
      type: SupervisionLiveEventType.REJECTED,
      requestId,
      request: null,
    });
    return { status: 'rejected', requestId };
  }

  /**
   * Lists the requests currently awaiting a given supervisor (used for SSE reconnect/initial state).
   */
  public listPendingForSupervisor(supervisorUserId: number): SupervisionRequestDto[] {
    const requests: SupervisionRequestDto[] = [];
    for (const request of this.pending.values()) {
      if (request.supervisorUserId === supervisorUserId) {
        requests.push(this.toDto(request));
      }
    }
    return requests;
  }

  private getPendingForSupervisorOrThrow(requestId: string, supervisor: User): PendingSupervisionRequest {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }
    if (request.supervisorUserId !== supervisor.id) {
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
    this.fail(request, new RequestTimeoutException('Supervision request expired before the supervisor responded'));
    this.supervisionLive.emitToSupervisor(request.supervisorUserId, {
      type: SupervisionLiveEventType.EXPIRED,
      requestId,
      request: null,
    });
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

  private toDto(request: PendingSupervisionRequest): SupervisionRequestDto {
    return {
      id: request.id,
      resourceId: request.resourceId,
      requesterUserId: request.requester.id,
      requesterUsername: request.requester.username,
      supervisorUserId: request.supervisorUserId,
      notes: request.dto.notes ?? null,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    };
  }
}
