import {
  Injectable,
  Logger,
  RequestTimeoutException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Inject,
  Optional,
} from '@nestjs/common';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';

import { ResourceUsageService } from '../usage/sessions/resource-usage.service';
import { computeStartDeadline, SessionDurationSettings } from '../usage/session-duration/session-duration.rules';

import { SupervisionLiveService } from './supervision-live.service';
import { ResourceIntroducerType, type UsageSession } from '@attraccess/application-models';

import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';

import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';

import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';

import { randomUUID } from 'crypto';
import { formatUserDisplayName } from '@attraccess/shared';

import { PreStartService } from '../usage/pre-start/pre-start.service';

import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';

import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';

import { ReaderSupervisionCallbacks, ReaderSupervisionArmer, SupervisionUser } from './supervision.types';
export type { ReaderSupervisionCallbacks, ReaderSupervisionArmer } from './supervision.types';
import { ClusterService } from '../../cluster/cluster.service';
import { orServiceUnavailable } from '../../cluster/valkey-call';
import {
  InMemorySupervisionStore,
  type StoredSupervisionRequest,
  type SupervisionStore,
  ValkeySupervisionStore,
} from './supervision-store';
import { RECHECK_AFTER_MS, SUPERVISION_EXPIRY_QUEUE, SupervisionSettlement } from './supervision-settlement';
import type { AuthenticationMethod } from '@attraccess/application-models';

/** The requester gives the duration estimate: a missing or too long one is refused now, not at the approval. */
function assertEstimateAcceptable(resource: SessionDurationSettings, dto: StartUsageSessionDto): void {
  computeStartDeadline(resource, new Date(), dto.estimatedDurationMinutes, true);
}

/**
 * Supervised-session requests (ATT-487/493/816). One API instance keeps pending requests in memory; several share
 * them in Valkey (ATT-1163). Every instance can list, approve, reject or expire a request; each settles once, by an
 * atomic claim. The requester's blocked call, the abort listener and the reader callbacks stay on the instance
 * that created the request, which hears the outcome over the cluster bus (or looks it up after its deadline).
 */
@Injectable()
export class SupervisionService {
  /** A pending request lapses this many milliseconds after creation. */
  public static readonly APPROVAL_TTL_MS = 30_000;

  protected readonly logger = new Logger(SupervisionService.name);

  protected readonly store: SupervisionStore;

  protected readonly settlement: SupervisionSettlement;

  protected readonly cluster: ClusterService;

  protected readerArmer: ReaderSupervisionArmer | null = null;

  constructor(
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly resourceIntroducersService: ResourceIntroducersService,
    protected readonly supervisionLive: SupervisionLiveService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
    protected readonly preStart: PreStartService,
    @Optional() cluster?: ClusterService,
  ) {
    this.cluster = cluster ?? ClusterService.local();
    this.store = this.cluster.valkey ? new ValkeySupervisionStore(this.cluster.valkey) : new InMemorySupervisionStore();
    this.settlement = new SupervisionSettlement(this.store, this.cluster, SupervisionService.APPROVAL_TTL_MS, {
      expire: (id) => this.expire(id),
      ended: (request, type) => this.emitToEligible(request, type),
      readerArmer: () => this.readerArmer,
    });
    this.cluster.deadlines.onDue(SUPERVISION_EXPIRY_QUEUE, (requestId) => this.expire(requestId));
    this.cluster.instances.onGone((instanceId) => this.settlement.cleanUpAfter(instanceId));
  }

  /** The resource of a pending request, for log lines about it; undefined once it is gone. */
  public pendingResourceId(requestId: string): number | undefined {
    return this.pending.get(requestId)?.resourceId;
  }

  /** Registered by the Attractap module at startup; see {@link ReaderSupervisionArmer}. */
  public setReaderArmer(armer: ReaderSupervisionArmer): void {
    this.readerArmer = armer;
  }

  protected async expire(requestId: string): Promise<void> {
    const request = await this.store.claim(requestId);
    if (!request) {
      return;
    }
    this.logger.debug(`Supervision request ${requestId} expired`);
    const error = new RequestTimeoutException('Supervision request expired before the supervisor responded');
    this.settlement.settle(request, { kind: 'failed', error, notifyReader: true });
    this.emitToEligible(request, SupervisionLiveEventType.EXPIRED);
  }

  /** Fans a terminal (non-REQUESTED) live event out to every supervisor the request reached. */
  protected emitToEligible(request: StoredSupervisionRequest, type: SupervisionLiveEventType): void {
    for (const supervisorUserId of request.eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, { type, requestId: request.id, request: null });
    }
  }

  protected toDto(request: StoredSupervisionRequest, recipientSupervisorId: number): SupervisionRequestDto {
    return {
      id: request.id,
      resourceId: request.resourceId,
      requesterUserId: request.requester.id,
      requesterUsername: request.requester.username,
      requesterDisplayName: formatUserDisplayName(request.requester),
      // For reader requests (no single named supervisor) report the recipient so the web popup
      // shows up consistently for whoever received it.
      supervisorUserId: request.supervisorUserId ?? recipientSupervisorId,
      notes: request.dto.notes ?? null,
      createdAt: new Date(request.createdAt),
      expiresAt: new Date(request.expiresAt),
    };
  }

  /**
   * Approves a pending request: starts the supervised session via the normal start path with the
   * supervisor attached, then resolves the waiting requester.
   */
  public async approve(
    requestId: string,
    supervisor: SupervisionUser,
    authenticationMethod: AuthenticationMethod | null = 'session',
    apiTokenId?: number,
  ): Promise<UsageSession> {
    const pending = await this.getPendingForSupervisorOrThrow(requestId, supervisor, { allowAnyAuthorized: true });
    await this.assertMayApprove(pending, supervisor);

    // assertMayApprove can hit the DB, which is long enough for the 30s deadline to fire underneath us.
    // Claiming only now means an expired (or rejected, or otherwise settled) request is never approved:
    // startSession below would open a real session on a physical machine nobody is waiting for.
    const request = await orServiceUnavailable(this.store.claim(requestId));
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }

    try {
      // The approval is a start for the requester, so the pre-start hooks apply (a confirm blocks, see PreStartService).
      await this.preStart.gateSupervision(request.resourceId, request.requester, request.dto, supervisor.id);
      const session = await this.resourceUsageService.startSession(request.resourceId, request.requester, request.dto, {
        supervisorUserId: supervisor.id,
        canAskDuration: request.canAskDuration,
        auditOrigin: {
          id: supervisor.id,
          authenticationMethod: authenticationMethod ?? 'session',
          ...(apiTokenId === undefined ? {} : { apiTokenId }),
        },
      });
      // Reader-originated requests surface the result to the reader websocket as well; the session was just
      // started here (the web popup won the race against an on-reader card tap).
      this.settlement.settle(request, {
        kind: 'resolved',
        session,
        supervisor: {
          id: supervisor.id,
          username: supervisor.username,
          displayName: formatUserDisplayName(supervisor),
        },
      });
      void this.audit.record({
        domain: 'resource',
        action: 'supervision.approved',
        actor: { id: supervisor.id, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
        subject: { type: 'resource', id: request.resourceId },
        details: {
          requestId: request.id,
          requesterUserId: request.requester.id,
          supervisorUserId: supervisor.id,
        },
      });
      this.emitToEligible(request, SupervisionLiveEventType.RESOLVED);
      return session;
    } catch (error) {
      // Surface the failure to both the supervisor (HTTP error) and the waiting requester.
      this.settlement.settle(request, { kind: 'failed', error: error as Error, notifyReader: true });
      throw error;
    }
  }

  /** Rejects a pending request: the waiting requester is failed with a Forbidden error. */
  public async reject(
    requestId: string,
    supervisor: SupervisionUser,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<SupervisionDecisionResponseDto> {
    await this.getPendingForSupervisorOrThrow(requestId, supervisor);
    const request = await orServiceUnavailable(this.store.claim(requestId));
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }
    const error = new ForbiddenException('The supervision request was rejected by the supervisor');
    this.settlement.settle(request, { kind: 'failed', error, notifyReader: true });
    void this.audit.record({
      domain: 'resource',
      action: 'supervision.rejected',
      actor: { id: supervisor.id, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'resource', id: request.resourceId },
      details: {
        requestId: request.id,
        requesterUserId: request.requester.id,
        supervisorUserId: supervisor.id,
      },
    });
    this.emitToEligible(request, SupervisionLiveEventType.REJECTED);
    return { status: 'rejected', requestId };
  }

  /** The requests awaiting a supervisor (SSE reconnect/initial state), whichever instance created them. */
  public async listPendingForSupervisor(supervisorUserId: number): Promise<SupervisionRequestDto[]> {
    const requests: SupervisionRequestDto[] = [];
    for (const request of await orServiceUnavailable(this.store.listPending())) {
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

  protected async getPendingForSupervisorOrThrow(
    requestId: string,
    supervisor: SupervisionUser,
    opts: { allowAnyAuthorized?: boolean } = {},
  ): Promise<StoredSupervisionRequest> {
    const request = await orServiceUnavailable(this.store.get(requestId));
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
  protected async assertMayApprove(request: StoredSupervisionRequest, supervisor: SupervisionUser): Promise<void> {
    if (request.supervisorUserId !== null) {
      return;
    }
    try {
      await this.resourceUsageService.validateSupervisedStart(request.resourceId, request.requester, supervisor.id);
    } catch {
      throw new ForbiddenException('You are not authorized to supervise this session');
    }
  }

  /**
   * Creates a reader-originated supervision request (ATT-493). The non-introduced requester has
   * already tapped at the reader; this fans the request out to every eligible supervisor via SSE.
   * Any currently authorized introducer can approve from their phone/PC, while the reader
   * simultaneously waits for one to tap their card. The first channel to resolve wins; the other
   * is cancelled.
   *
   * Unlike {@link requestSupervisedSession} there is no blocking HTTP caller — resolution is
   * surfaced through `callbacks` (which notify the reader websocket), on this instance whichever
   * instance approves.
   */
  public async createReaderRequest(params: {
    resourceId: number;
    requester: SupervisionUser;
    dto: StartUsageSessionDto;
    eligibleSupervisorIds: number[];
    callbacks: ReaderSupervisionCallbacks;
    canAskDuration?: boolean;
  }): Promise<{ requestId: string; expiresAt: Date }> {
    const { callbacks, ...rest } = params;

    const { request, promise } = await this.createPending({
      ...rest,
      supervisorUserId: null,
      readerCallbacks: callbacks,
    });

    // This flow has no HTTP caller — the outcome travels via readerCallbacks — so nothing awaits the
    // promise and its rejection would surface as an unhandled one. Swallowed here rather than inside
    // createPending, so the flows that *are* awaited keep propagating normally.
    promise.catch(() => undefined);

    this.logger.debug(
      `Reader supervision request ${request.id} created for resource ${params.resourceId} (requester ${params.requester.id}, ${params.eligibleSupervisorIds.length} eligible supervisors)`,
    );
    this.emitRequested(request);

    return { requestId: request.id, expiresAt: new Date(request.expiresAt) };
  }

  /**
   * Registers a pending request, its waiter on this instance and its expiry deadline.
   *
   * The returned promise is what the blocking HTTP callers await. Reader-originated requests
   * (ATT-493) have no HTTP caller and simply ignore it — their outcome travels via readerCallbacks —
   * but it is still settled, so the two flows share one lifecycle instead of two.
   */
  protected async createPending(params: {
    id?: string;
    resourceId: number;
    requester: SupervisionUser;
    dto: StartUsageSessionDto;
    supervisorUserId: number | null;
    eligibleSupervisorIds: number[];
    readerCallbacks?: ReaderSupervisionCallbacks;
    readerId?: number;
    signal?: AbortSignal;
    canAskDuration?: boolean;
  }): Promise<{ request: StoredSupervisionRequest; promise: Promise<UsageSession> }> {
    params.signal?.throwIfAborted();
    const createdAt = Date.now();
    const request: StoredSupervisionRequest = {
      id: params.id ?? randomUUID(),
      resourceId: params.resourceId,
      requester: params.requester,
      supervisorUserId: params.supervisorUserId,
      eligibleSupervisorIds: params.eligibleSupervisorIds,
      dto: params.dto,
      canAskDuration: params.canAskDuration ?? false,
      createdAt,
      expiresAt: createdAt + SupervisionService.APPROVAL_TTL_MS,
      ...(params.readerId === undefined ? {} : { readerId: params.readerId }),
      originInstance: this.cluster.instanceId,
    };
    const { id } = request;
    const promise = new Promise<UsageSession>((resolve, reject) =>
      this.settlement.waiters.add(id, { resolve, reject, readerCallbacks: params.readerCallbacks }),
    );

    try {
      await this.store.create(request);
      await this.cluster.deadlines.schedule(SUPERVISION_EXPIRY_QUEUE, id, request.expiresAt);
    } catch (error) {
      promise.catch(() => undefined);
      this.settlement.waiters.apply(id, { kind: 'failed', error: error as Error, notifyReader: false });
      void this.store.claim(id).catch(() => undefined);
      return orServiceUnavailable(Promise.reject(error));
    }

    this.settlement.watch(id);

    if (params.signal) {
      const signal = params.signal;
      const onAbort = () => void this.settlement.abort(id);
      this.settlement.waiters.setRemoveAbortListener(id, () => signal.removeEventListener('abort', onAbort));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      // Arming the reader may still be awaiting its ACK when cancellation arrives.
      // Consume early rejection here while retaining the original promise for the caller.
      promise.catch(() => undefined);
    }
    return { request, promise };
  }

  /** Fans the initial REQUESTED event out to every supervisor who may approve the request. */
  protected emitRequested(request: StoredSupervisionRequest): void {
    for (const supervisorUserId of request.eligibleSupervisorIds) {
      this.supervisionLive.emitToSupervisor(supervisorUserId, {
        type: SupervisionLiveEventType.REQUESTED,
        requestId: request.id,
        request: this.toDto(request, supervisorUserId),
      });
    }
  }

  /**
   * Settles a reader request because the supervisor approved it by tapping their card at the reader.
   * The session is started by the websocket session-start handler (after the on-reader crypto auth),
   * so here we only tear down the pending web request and dismiss any open web popups.
   */
  public async settleByCard(requestId: string): Promise<void> {
    const request = await this.settlement.claimQuietly(requestId);
    if (!request) {
      return;
    }
    // Fail rather than mark settled: a web-initiated request (ATT-816) with an HTTP caller would otherwise
    // never settle and hold the connection. Failing is also the honest answer — the session that started
    // belongs to whoever tapped at the reader, not to the requester waiting here.
    this.settlement.settle(request, {
      kind: 'failed',
      error: new ForbiddenException('Another user started a session at the reader first'),
      notifyReader: false,
    });
    this.emitToEligible(request, SupervisionLiveEventType.RESOLVED);
  }

  /**
   * Cancels a reader request because the reader timed out, was disconnected, or the requester
   * aborted. Dismisses the web popups; does not invoke the reader callbacks (the reader already knows).
   */
  public async cancelReaderRequest(requestId: string, reason?: string): Promise<void> {
    const request = await this.settlement.claimQuietly(requestId);
    if (!request) {
      return;
    }
    // Fail rather than just mark settled: a web-initiated request (ATT-816) has a caller blocked on it.
    // `reason` lets the caller hear what actually killed it instead of a generic timeout.
    this.settlement.settle(request, {
      kind: 'failed',
      error: new RequestTimeoutException(reason ?? 'The supervision request was cancelled at the reader'),
      notifyReader: false,
    });
    this.emitToEligible(request, SupervisionLiveEventType.EXPIRED);
  }

  /**
   * Creates a supervision request and returns a promise that resolves with the started session once
   * a supervisor approves, or rejects with a timeout/rejection error.
   *
   * Two approval channels, selected by the dto: a single named supervisor who gets a popup, or a
   * reader armed to accept any eligible supervisor's card (ATT-816).
   */
  public async requestSupervisedSession(
    resourceId: number,
    requester: SupervisionUser,
    dto: RequestSupervisedSessionDto,
    signal?: AbortSignal,
  ): Promise<UsageSession> {
    const { supervisorUserId, readerId } = dto;

    if ((supervisorUserId == null) === (readerId == null)) {
      throw new BadRequestException('Provide exactly one of supervisorUserId or readerId');
    }

    return readerId == null
      ? this.requestFromSupervisor(resourceId, requester, dto, supervisorUserId, signal)
      : this.requestAtReader(resourceId, requester, dto, readerId, signal);
  }

  /** Web flow (ATT-487): one named supervisor, notified over SSE, approves from their own device. */
  protected async requestFromSupervisor(
    resourceId: number,
    requester: SupervisionUser,
    dto: RequestSupervisedSessionDto,
    supervisorUserId: number,
    signal?: AbortSignal,
  ): Promise<UsageSession> {
    // Validate eagerly so the requester gets immediate, meaningful feedback instead of waiting 30s
    // for a request that could never have been approved (wrong supervisor, self-supervision, ...).
    const resource = await this.resourceUsageService.assertSupportsSupervision(resourceId);
    assertEstimateAcceptable(resource, dto);
    await this.resourceUsageService.validateSupervisedStart(
      resourceId,
      requester,
      supervisorUserId,
      undefined,
      resource,
    );

    const { request, promise } = await this.createPending({
      resourceId,
      requester,
      dto,
      supervisorUserId,
      eligibleSupervisorIds: [supervisorUserId],
      signal,
      canAskDuration: true,
    });

    this.logger.debug(
      `Supervision request ${request.id} created for resource ${resourceId} (requester ${requester.id}, supervisor ${supervisorUserId})`,
    );
    this.emitRequested(request);
    return promise;
  }

  /**
   * Reader flow (ATT-816): the requester picks a reader instead of a person. The reader is armed to
   * wait for a card while the request is simultaneously broadcast to every eligible supervisor over
   * SSE, so either channel can approve — same race as the reader-originated flow.
   */
  protected async requestAtReader(
    resourceId: number,
    requester: SupervisionUser,
    dto: RequestSupervisedSessionDto,
    readerId: number,
    signal?: AbortSignal,
  ): Promise<UsageSession> {
    if (!this.readerArmer) {
      throw new ServiceUnavailableException('Reader-based supervision is unavailable');
    }

    assertEstimateAcceptable(await this.resourceUsageService.assertSupportsSupervision(resourceId), dto);

    const eligibleSupervisorIds = await this.getEligibleSupervisorIds(resourceId, requester.id);
    if (eligibleSupervisorIds.length === 0) {
      throw new BadRequestException('Nobody else can supervise on this resource');
    }

    // One armed reader per requester at a time. Arming claims a shared physical screen for 30s, so
    // without this a single user could hold several readers hostage, or re-arm one in a loop. The
    // reservation is atomic (cluster-wide with Valkey), so N parallel requests cannot all pass it —
    // which is exactly what someone abusing this would try.
    const id = randomUUID();
    const reserved = await orServiceUnavailable(
      this.store.reserveReaderRequest(requester.id, id, SupervisionService.APPROVAL_TTL_MS + RECHECK_AFTER_MS),
    );
    if (!reserved) {
      throw new ConflictException('You already have a supervision request waiting at a reader');
    }

    // Registered before arming, so the id the reader is about to carry is already resolvable. Arming
    // can take seconds (ACK retries); a disconnect or a card tap in that window used to find nothing
    // to settle, leaving the requester to wait out the full TTL.
    let created: Awaited<ReturnType<SupervisionService['createPending']>>;
    try {
      created = await this.createPending({
        id,
        resourceId,
        requester,
        dto,
        supervisorUserId: null,
        eligibleSupervisorIds,
        readerId,
        signal,
        canAskDuration: true,
      });
    } catch (error) {
      void this.store.releaseReaderRequest(requester.id, id).catch(() => undefined);
      throw error;
    }
    const { request, promise } = created;

    let callbacks: ReaderSupervisionCallbacks;
    try {
      callbacks = await this.readerArmer.arm({ readerId, resourceId, requester, requestId: id });
    } catch (error) {
      // A rejected reader (offline, busy, unresponsive) fails the caller immediately rather than
      // leaving them watching a countdown nobody can answer. Unwind the registration.
      promise.catch(() => undefined);
      const claimed = await this.store.claim(id).catch(() => null);
      if (claimed) this.settlement.settle(claimed, { kind: 'failed', error: error as Error, notifyReader: false });
      else this.settlement.waiters.apply(id, { kind: 'failed', error: error as Error, notifyReader: false });
      throw error;
    }

    // Settled while we were arming — the reader disconnected, or a card tap started a session. The
    // requester's promise already carries that outcome; just make sure the reader stops waiting.
    if (!this.settlement.waiters.has(id)) {
      callbacks.onFailed(new RequestTimeoutException('The supervision request ended before the reader was ready'));
      return promise;
    }

    this.settlement.waiters.setReaderCallbacks(id, callbacks);

    this.logger.debug(
      `Supervision request ${id} created for resource ${resourceId} at reader ${readerId} ` +
        `(requester ${requester.id}, ${eligibleSupervisorIds.length} eligible supervisors)`,
    );
    this.emitRequested(request);
    return promise;
  }

  /**
   * The users who may supervise on this resource: its introducers (including group-level), minus
   * the requester. An empty list means no supervision is possible.
   */
  public async getEligibleSupervisorIds(resourceId: number, requesterId: number): Promise<number[]> {
    const introducers = await this.resourceIntroducersService.getMany(resourceId, ResourceIntroducerType.INTRODUCER);
    const ids = new Set<number>();
    for (const introducer of introducers) {
      if (introducer.userId !== requesterId && introducer.user) {
        ids.add(introducer.userId);
      }
    }
    return Array.from(ids);
  }
}
