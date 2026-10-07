import { ResourceIntroducerType, ResourceUsage, User } from '@attraccess/database-entities';
import {
  BadRequestException,
  ConflictException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { ReaderSupervisionCallbacks } from './supervision.service.feature-definitions';
import { SupervisionServiceRouteContext } from './supervision.service.route-context';
export abstract class SupervisionRequestAdmissionImplementation extends SupervisionServiceRouteContext {
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
  protected async requestFromSupervisor(
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
  protected async requestAtReader(
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
