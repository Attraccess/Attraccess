import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionDecisionResponseDto } from './dtos/supervisionDecision.response.dto';
import { SupervisionLiveService } from './supervision-live.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
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
  /**
   * The reader this request armed from the web (ATT-816). Set synchronously at registration, before
   * arming, so the one-armed-reader-per-requester scan sees concurrent requests.
   */
  readerId?: number;
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
 * Port for arming a reader to wait for a supervisor card on behalf of a web requester (ATT-816).
 *
 * Implemented in the Attractap module and registered via {@link SupervisionService.setReaderArmer}.
 * A registration hook rather than an injected dependency, because the Attractap module already
 * depends on this service — injecting the gateway here would close the cycle.
 */
export interface ReaderSupervisionArmer {
  /**
   * Puts the reader into its supervisor-card wait state. Throws if the reader is unknown, offline
   * or busy with another flow, so the requester fails fast instead of watching a doomed countdown.
   * Returns the callbacks that report the request's outcome back to that reader.
   */
  arm(params: {
    readerId: number;
    resourceId: number;
    requester: User;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks>;
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
  private readerArmer: ReaderSupervisionArmer | null = null;

  constructor(
    private readonly resourceUsageService: ResourceUsageService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
    private readonly supervisionLive: SupervisionLiveService,
    private readonly rbacService: RbacService,
  ) {}

  /** Registered by the Attractap module at startup; see {@link ReaderSupervisionArmer}. */
  public setReaderArmer(armer: ReaderSupervisionArmer): void {
    this.readerArmer = armer;
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
    requester: User,
    dto: RequestSupervisedSessionDto,
  ): Promise<ResourceUsage> {
    const { supervisorUserId, readerId } = dto;

    if ((supervisorUserId == null) === (readerId == null)) {
      throw new BadRequestException('Provide exactly one of supervisorUserId or readerId');
    }

    return readerId == null
      ? this.requestFromSupervisor(resourceId, requester, dto, supervisorUserId)
      : this.requestAtReader(resourceId, requester, dto, readerId);
  }

  /** Web flow (ATT-487): one named supervisor, notified over SSE, approves from their own device. */
  private async requestFromSupervisor(
    resourceId: number,
    requester: User,
    dto: RequestSupervisedSessionDto,
    supervisorUserId: number,
  ): Promise<ResourceUsage> {
    // Validate eagerly so the requester gets immediate, meaningful feedback instead of waiting 30s
    // for a request that could never have been approved (wrong supervisor, self-supervision, ...).
    await this.resourceUsageService.validateSupervisedStart(resourceId, requester, supervisorUserId);

    const { id, promise } = this.createPending({
      resourceId,
      requester,
      dto,
      supervisorUserId,
      eligibleSupervisorIds: [supervisorUserId],
    });

    this.logger.debug(
      `Supervision request ${id} created for resource ${resourceId} (requester ${requester.id}, supervisor ${supervisorUserId})`,
    );
    this.emitRequested(id);
    return promise;
  }

  /**
   * Reader flow (ATT-816): the requester picks a reader instead of a person. The reader is armed to
   * wait for a card while the request is simultaneously broadcast to every eligible supervisor over
   * SSE, so either channel can approve — same race as the reader-originated flow.
   */
  private async requestAtReader(
    resourceId: number,
    requester: User,
    dto: RequestSupervisedSessionDto,
    readerId: number,
  ): Promise<ResourceUsage> {
    if (!this.readerArmer) {
      throw new ServiceUnavailableException('Reader-based supervision is unavailable');
    }

    await this.resourceUsageService.assertSupportsSupervision(resourceId);

    const eligibleSupervisorIds = await this.getEligibleSupervisorIds(resourceId, requester.id);
    if (eligibleSupervisorIds.length === 0) {
      throw new BadRequestException('Nobody else can supervise on this resource');
    }

    // --- no awaits from here until the request is registered ---

    // One armed reader per requester at a time. Arming claims a shared physical screen for 30s, so
    // without this a single user could hold several readers hostage, or re-arm one in a loop. The
    // scan and the registration below must stay in the same synchronous run, or N parallel requests
    // all see an empty map and all arm — which is exactly what someone abusing this would do.
    for (const pending of this.pending.values()) {
      if (pending.readerId !== undefined && pending.requester.id === requester.id) {
        throw new ConflictException('You already have a supervision request waiting at a reader');
      }
    }

    // Registered before arming, so the id the reader is about to carry is already resolvable. Arming
    // can take seconds (ACK retries); a disconnect or a card tap in that window used to hit
    // `pending.get(id) === undefined` and no-op, leaving the requester to wait out the full TTL.
    const { id, promise } = this.createPending({
      resourceId,
      requester,
      dto,
      supervisorUserId: null,
      eligibleSupervisorIds,
      readerId,
    });
    const request = this.pending.get(id);

    let callbacks: ReaderSupervisionCallbacks;
    try {
      callbacks = await this.readerArmer.arm({ readerId, resourceId, requester, requestId: id });
    } catch (error) {
      // A rejected reader (offline, busy, unresponsive) fails the caller immediately rather than
      // leaving them watching a countdown nobody can answer. Unwind the registration.
      this.clear(request);
      this.fail(request, error as Error);
      promise.catch(() => undefined);
      throw error;
    }

    // Settled while we were arming — the reader disconnected, or a card tap started a session. The
    // requester's promise already carries that outcome; just make sure the reader stops waiting.
    if (this.pending.get(id) !== request) {
      callbacks.onFailed(new RequestTimeoutException('The supervision request ended before the reader was ready'));
      return promise;
    }

    request.readerCallbacks = callbacks;

    this.logger.debug(
      `Supervision request ${id} created for resource ${resourceId} at reader ${readerId} ` +
        `(requester ${requester.id}, ${eligibleSupervisorIds.length} eligible supervisors)`,
    );
    this.emitRequested(id);
    return promise;
  }

  /**
   * The users who may supervise on this resource: its introducers and maintainers (including
   * group-level), minus the requester.
   *
   * When that leaves nobody, global resource managers stand in. They are valid supervisors —
   * {@link ResourceUsageService.validateSupervisedStart} accepts anyone holding `resources.update`,
   * and the docs define a supervisor as an introducer, maintainer *or* resource manager — but they
   * are normally kept out of this list, because it drives the SSE broadcast and popping a request at
   * every admin is not wanted. A resource with no introducers (the manager who set it up is usually
   * the only candidate, and is often the requester) used to dead-end on the empty list instead
   * (ATT-867), so for exactly that case the admins *are* the only people who can help, and this adds
   * no traffic to any request that does have introducers.
   *
   * Being one list rather than a broadcast list plus a hidden fallback is what makes the rest work:
   * managers get the SSE event and the terminal RESOLVED/EXPIRED/REJECTED, they can approve *and*
   * reject through the normal path, and the reader can name them to the requester.
   */
  public async getEligibleSupervisorIds(resourceId: number, requesterId: number): Promise<number[]> {
    const introducers = await this.resourceIntroducersService.getMany(resourceId);
    const ids = new Set<number>();
    for (const introducer of introducers) {
      if (introducer.userId !== requesterId) {
        ids.add(introducer.userId);
      }
    }
    if (ids.size > 0) {
      return Array.from(ids);
    }
    const managerIds = await this.rbacService.getUserIdsWithPermission('resources.update');
    return managerIds.filter((id) => id !== requesterId);
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
  private createPending(params: {
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
  private emitRequested(requestId: string): void {
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

  /**
   * Approves a pending request: starts the supervised session via the normal start path with the
   * supervisor attached, then resolves the waiting requester.
   */
  public async approve(requestId: string, supervisor: User): Promise<ResourceUsage> {
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

  private getPendingForSupervisorOrThrow(
    requestId: string,
    supervisor: User,
    opts: { allowAnyAuthorized?: boolean } = {},
  ): PendingSupervisionRequest {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new NotFoundException('Supervision request not found or already expired');
    }
    // Web flow: a single named supervisor. Broadcast flow (supervisorUserId === null): any of the
    // supervisors the request was broadcast to — or, when the caller will run assertMayApprove,
    // anyone that check accepts.
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
   * Second gate for broadcast requests, kept deliberately identical to the one the reader applies
   * to a presented card (`validateSupervisedStart`).
   *
   * `eligibleSupervisorIds` is introducers/maintainers only, so a global `resources.update` holder
   * is missing from it — yet the reader accepts their card, hands out key material and beeps
   * success. Without this fallback their approval would then be refused, stranding both the reader
   * and the requester.
   */
  private async assertMayApprove(request: PendingSupervisionRequest, supervisor: User): Promise<void> {
    if (request.supervisorUserId !== null || request.eligibleSupervisorIds.includes(supervisor.id)) {
      return;
    }
    try {
      await this.resourceUsageService.validateSupervisedStart(request.resourceId, request.requester, supervisor.id);
    } catch {
      throw new ForbiddenException('You are not authorized to supervise this session');
    }
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
