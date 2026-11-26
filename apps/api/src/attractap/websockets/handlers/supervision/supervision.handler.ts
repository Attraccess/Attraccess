import { formatUserDisplayName } from '@attraccess/shared';
import { SupervisionMode } from '@attraccess/application-models';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { SupervisionService, ReaderSupervisionCallbacks } from '../../../../resources/supervision/supervision.service';

import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';

import { UsersService } from '../../../../users-and-auth/users/users.service';

import { AttractapService } from '../../../attractap.service';
import { asCoreUser, type CoreUser } from '../../../core-user';
import { ATTRACTAP_RESOURCE_READS, type AttractapResourceReads } from '../../../reader-resource-reads.port';
import { assertReaderPaired } from '../../../reader-pairing';

import { CardOperationsService } from '../../card-operations.service';
import { assertReaderRelaysCards } from '../card/card-write-errors';
import { WebsocketService } from '../../websocket.service';
import { ReaderRouter, armFailure } from '../../reader-router';
import { ReaderScreenService, screenOwner } from '../../reader-screen.service';
import { rethrowValkeyUnavailable } from '../../../../cluster/valkey-call';
import { getSessionCapacity } from '../../../../resources/usage/sessions/active-usage';
import {
  computeStartDeadline,
  validReaderEstimate,
} from '../../../../resources/usage/session-duration/session-duration.rules';

import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket, CardDetection } from '../../websocket.types';

@Injectable()
export class AttractapSupervisionHandler implements OnModuleInit {
  protected readonly logger = new Logger(AttractapSupervisionHandler.name);

  @Inject(AttractapService)
  protected attractapService: AttractapService;

  @Inject(WebsocketService)
  protected websocketService: WebsocketService;

  @Inject(UsersService)
  protected usersService: UsersService;

  @Inject(ResourceUsageService)
  protected resourceUsageService: ResourceUsageService;

  @Inject(CardOperationsService)
  protected cardOperations: CardOperationsService;

  @Inject(SupervisionService)
  protected supervisionService: SupervisionService;

  @Inject(ATTRACTAP_RESOURCE_READS)
  protected resourceReads: AttractapResourceReads;

  /**
   * Registers this handler as the service's reader-arming port. A registration hook rather than an
   * injected dependency, because SupervisionService cannot depend on the Attractap module without
   * closing a cycle (this handler already injects the service).
   */
  @Optional()
  @Inject(ReaderRouter)
  protected readerRouter?: ReaderRouter;

  @Optional()
  @Inject(ReaderScreenService)
  protected readerScreen?: ReaderScreenService;

  /** Without Nest (unit tests) this instance is the whole cluster. */
  protected get router(): ReaderRouter {
    return (this.readerRouter ??= new ReaderRouter(this.websocketService));
  }

  protected get screen(): ReaderScreenService {
    return (this.readerScreen ??= new ReaderScreenService());
  }

  public onModuleInit(): void {
    this.supervisionService.setReaderArmer({
      arm: (params) => this.armReader({ ...params, requester: params.requester as unknown as CoreUser }),
      disarm: ({ readerId, requestId, error }) =>
        this.notifyReader(readerId, requestId, { success: false, error: error?.message ?? 'SUPERVISION_FAILED' }),
    });
    // Other instances reach the sockets of readers this instance holds through these (ATT-1163).
    this.router.handle(ARM, (payload: ArmPayload) => this.armLocalSockets(payload));
    this.router.handle(NOTIFY, (payload: NotifyPayload) => this.notifyLocalSockets(payload));
    this.screen.onLost('supervision', (_readerId, requestId) => this.supervisionService.cancelReaderRequest(requestId));
  }

  /** Reader aborted (cancel button / its own 30s timeout). Tear down the pending web request. */
  public async handleSupervisionCancel(socket: AuthenticatedWebSocket) {
    this.cancelForSocket(socket);
  }

  /**
   * Cancels any in-progress supervision flow for this socket. Also used on disconnect, which clears
   * `socket.readerId` first and passes the old id, so a web-armed flow's screen claim is released.
   */
  public cancelForSocket(socket: AuthenticatedWebSocket, readerId: number | null = socket.readerId): void {
    const requestId = socket.state.supervisionFlow?.requestId;
    if (requestId) {
      void this.supervisionService.cancelReaderRequest(requestId);
      if (readerId != null) this.screen.release(readerId, screenOwner('supervision', requestId));
    }
    socket.state.supervisionFlow = null;
  }

  /**
   * Reader presents a supervisor card. The server authenticates the physical card with the stored
   * key, validates the supervisor against the resource and only then records the approval. For a
   * reader-started flow the reader goes on to start the session (the approval is consumed by the
   * session-start handler); for a web-started flow the pending web request is approved right here.
   */
  public async handleSupervisorCardDetected(
    socket: AuthenticatedWebSocket,
    detection: CardDetection,
    resourceId: number,
  ) {
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, payload));

    const flow = socket.state.supervisionFlow;
    if (!flow || flow.resourceId !== resourceId) {
      await reply({ error: 'NO_SUPERVISION_IN_PROGRESS' });
      return;
    }

    const requester = await this.usersService.findOne({ id: flow.requesterUserId });
    if (!requester) {
      await reply({ error: 'USER_NOT_FOUND' });
      return;
    }

    const verified = await this.cardOperations.verifyCard(socket, 'supervisor', detection);
    if (!verified.ok) {
      await reply({ error: verified.error });
      return;
    }
    const nfcCard = verified.card;
    // The flow may have ended or been replaced while the card was checked.
    if (socket.state.supervisionFlow !== flow) {
      await reply({ error: 'NO_SUPERVISION_IN_PROGRESS' });
      return;
    }

    try {
      // Reuses the Phase-1 guard: resource supports supervision, supervisor != requester, and the
      // supervisor is an introducer.
      await this.resourceUsageService.validateSupervisedStart(resourceId, requester, nfcCard.user.id);
    } catch (error) {
      this.logger.debug(`Supervisor card rejected for resource ${resourceId}: ${(error as Error).message}`);
      await reply({ error: 'SUPERVISOR_NOT_AUTHORIZED' });
      return;
    }

    socket.state.supervisionFlow = { ...flow, approvedSupervisorUserId: nfcCard.user.id };

    if (flow.webInitiated) {
      await this.approveWebRequest(socket, socket.state.supervisionFlow, asCoreUser(nfcCard.user));
      return;
    }
    await reply({ username: nfcCard.user.username, displayName: formatUserDisplayName(nfcCard.user) });
  }

  /**
   * The requester is not at the reader (web-started flow), so the reader must not start the session
   * — approving the pending web request does it, and resolves the requester's blocked call.
   */
  private async approveWebRequest(
    socket: AuthenticatedWebSocket,
    flow: NonNullable<AuthenticatedWebSocket['state']['supervisionFlow']>,
    supervisor: CoreUser,
  ) {
    const fail = async (error: string) => {
      // Tear the server-side request down alongside the socket state — the two belong together (see
      // cancelForSocket). Leaving it pending would make the requester wait out the full TTL for a
      // generic timeout instead of this reason. Safe no-op when approve() already settled the request.
      if (flow.requestId) {
        void this.supervisionService.cancelReaderRequest(flow.requestId, `Supervision failed at the reader: ${error}`);
        if (socket.readerId != null) this.screen.release(socket.readerId, screenOwner('supervision', flow.requestId));
      }
      socket.state.supervisionFlow = null;
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, { success: false, error }));
    };

    if (!flow.requestId) {
      await fail('NO_SUPERVISION_IN_PROGRESS');
      return;
    }
    try {
      // On success the armer's callbacks report SUPERVISION_RESOLVED, so nothing to send here.
      await this.supervisionService.approve(flow.requestId, supervisor, null);
    } catch (error) {
      // approve() only invokes the callbacks for failures raised *inside* it — an authorization or
      // not-found throw happens before that, and would leave the reader sitting in its "starting"
      // phase until its own timeout with no explanation. Tell it directly.
      this.logger.debug(`Web-initiated supervision approval failed: ${(error as Error).message}`);
      await fail((error as Error).message ?? 'SUPERVISION_FAILED');
    }
  }

  /**
   * Reader asks to open a supervision request for the user who just tapped. Broadcasts the request
   * to eligible supervisors and records the flow on the socket.
   */
  public async handleSupervisionRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, estimatedDurationMinutes } = data.payload as {
      resourceId: number;
      /** Minutes the requester will use the machine at most (capabilities.sessionDuration readers). */
      estimatedDurationMinutes?: unknown;
    };

    const requesterUserId = socket.state.verifiedUserId;
    if (!requesterUserId) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_SET' }));
      return;
    }

    const requester = await this.usersService.findOne({ id: requesterUserId });
    if (!requester) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_FOUND' }));
      return;
    }

    const resource = await this.resourceReads.findResource(resourceId);
    if (!resource) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'RESOURCE_NOT_FOUND' }),
      );
      return;
    }

    if (
      resource.supervisionMode !== SupervisionMode.SUPERVISION_ALLOWED &&
      resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED
    ) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'SUPERVISION_NOT_SUPPORTED' }),
      );
      return;
    }

    // The estimate is checked now like a web request's, not only once a supervisor approved.
    const dto = validReaderEstimate(estimatedDurationMinutes);
    const canAskDuration = socket.state.sessionDuration === true;
    try {
      computeStartDeadline(resource, new Date(), dto.estimatedDurationMinutes, canAskDuration);
    } catch (error) {
      const code = (error as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: code ?? 'SUPERVISION_FAILED' }),
      );
      return;
    }

    // Only introducers may supervise, so an empty list means the reader must not start a request.
    const eligibleSupervisorIds = await this.supervisionService.getEligibleSupervisorIds(resourceId, requester.id);
    if (eligibleSupervisorIds.length === 0) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'NO_SUPERVISORS_AVAILABLE' }),
      );
      return;
    }

    // Cancel any stale flow still hanging around on this socket before opening a new one.
    this.cancelForSocket(socket);

    // Captured so the async callbacks (fired on web approval/expiry) can verify the socket is still
    // on the same flow before touching its state or messaging the reader.
    let createdRequestId: string | null = null;

    let created: Awaited<ReturnType<SupervisionService['createReaderRequest']>>;
    try {
      created = await this.supervisionService.createReaderRequest({
        resourceId,
        requester,
        // No notes/project from the reader's two-card flow; the estimate survives an approval on the web.
        dto,
        canAskDuration,
        eligibleSupervisorIds,
        callbacks: {
          onResolved: (_session, supervisor) => {
            if (socket.state.supervisionFlow?.requestId !== createdRequestId) {
              return;
            }
            socket.state.supervisionFlow = null;
            void socket.sendMessage(
              new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, {
                success: true,
                resourceId,
                supervisorUsername: supervisor.username,
                supervisorDisplayName: supervisor.displayName,
              }),
            );
          },
          onFailed: (error) => {
            if (socket.state.supervisionFlow?.requestId !== createdRequestId) {
              return;
            }
            socket.state.supervisionFlow = null;
            void socket.sendMessage(
              new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, {
                success: false,
                resourceId,
                error: error?.message ?? 'SUPERVISION_FAILED',
              }),
            );
          },
        },
      });
    } catch (error) {
      // With several instances the request lives in Valkey; unreachable, the reader hears at once instead of
      // waiting out its own timeout.
      this.logger.warn(`Could not create a supervision request at the reader: ${(error as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'SUPERVISION_FAILED' }),
      );
      return;
    }
    const { requestId, expiresAt } = created;

    createdRequestId = requestId;
    // No screen claim: the reader started this itself, and a web arm for it is delivered to this instance, whose
    // busy check sees the flow below.
    socket.state.supervisionFlow = {
      resourceId,
      requesterUserId: requester.id,
      requestId,
      approvedSupervisorUserId: null,
    };

    const { supervisorNames, supervisorDisplayNames } = await this.getSupervisorNames(eligibleSupervisorIds);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, {
        success: true,
        requestId,
        expiresAt: expiresAt.toISOString(),
        timeoutMs: SupervisionService.APPROVAL_TTL_MS,
        supervisorNames,
        supervisorDisplayNames,
      }),
    );
  }

  /**
   * Web-initiated supervision (ATT-816): put a reader into its supervisor-card wait state on behalf
   * of a requester who is using the web UI. Nobody has tapped a card here, so the requester comes
   * from the HTTP session and the reader is told not to start the session itself.
   */
  protected async armReader(params: {
    readerId: number;
    resourceId: number;
    requester: CoreUser;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks> {
    const { readerId, resourceId, requester, requestId } = params;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader) {
      throw new NotFoundException(`Reader not found: ${readerId}`);
    }
    assertReaderPaired(reader);

    // Supervision draws its whole UI on the reader's screen; display-less readers cannot run it.
    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new BadRequestException('This reader does not support supervisor authentication');
    }

    const holders = await this.router.holders(readerId).catch(rethrowValkeyUnavailable);
    if (holders.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }

    // Readers on firmware before 2.0.0 cannot relay card commands, so they cannot check a card. Sockets on other
    // instances are checked there.
    const local = this.router.localSockets(readerId);
    if (local.length > 0) assertReaderRelaysCards(local);

    // A live session is something a user would notice losing. Asked of the source of truth rather
    // than mirrored into socket state, so it cannot go stale.
    //
    // Checked BEFORE the socket state below, deliberately: this is a DB round-trip, and an await
    // between the socket check and the assignment would let two concurrent arms of the same reader
    // both pass and the second silently overwrite the first.
    for (const linkedResource of reader.resources ?? []) {
      // Arming only needs a free slot; the supervisee takes it, the supervisor never does.
      const sessions = await this.resourceUsageService.getActiveSessionsForResource(linkedResource.id);
      if (getSessionCapacity(linkedResource, sessions.length).isFull) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

    // One flow per reader screen across all instances; released when the request ends.
    const owner = screenOwner('supervision', requestId);
    if (!(await this.screen.claim(readerId, owner, SupervisionService.APPROVAL_TTL_MS + CLAIM_GRACE_MS))) {
      throw new ConflictException('The selected reader is busy with another operation');
    }

    const payload: ArmPayload = {
      readerId,
      resourceId,
      requestId,
      requesterId: requester.id,
      requesterUsername: requester.username,
      requesterDisplayName: formatUserDisplayName(requester),
    };
    const outcomes = await this.router.onHolders(holders, {
      type: ARM,
      payload,
      local: () => this.armLocalSockets(payload),
      timeoutMs: ROUTE_TIMEOUT_MS,
    });
    if (!outcomes.some((outcome) => outcome.ok)) {
      this.screen.release(readerId, owner);
      throw armFailure(outcomes, new BadRequestException('The selected reader did not respond'));
    }

    const notify = (result: Record<string, unknown>) => this.notifyReader(readerId, requestId, result);
    return {
      onResolved: (_session, supervisor) =>
        notify({
          success: true,
          resourceId,
          supervisorUsername: supervisor.username,
          supervisorDisplayName: supervisor.displayName,
        }),
      onFailed: (error) => notify({ success: false, resourceId, error: error?.message ?? 'SUPERVISION_FAILED' }),
    };
  }

  /** Puts this instance's sockets of the reader into the supervisor-card wait state. */
  protected async armLocalSockets(payload: ArmPayload): Promise<true> {
    const { readerId, requestId, resourceId } = payload;
    const sockets = this.router.localSockets(readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }
    assertReaderRelaysCards(sockets);

    // --- no awaits from here to the assignment, so check-and-claim stays atomic ---

    // "Busy" also means a sub-flow that owns the screen. Deliberately NOT keyed on
    // `verifiedUserId`: a user who is merely logged in at the reader (until logout, timeout,
    // disconnect or the next tap) does not own the screen, and the supervision flow runs next to
    // that login anyway.
    if (
      sockets.some(
        (socket) =>
          socket.state.supervisionFlow ||
          socket.state.enrollment ||
          socket.state.resetNfcCardData ||
          socket.state.massIntroductionFlow,
      )
    ) {
      throw new ConflictException('The selected reader is busy with another operation');
    }

    for (const socket of sockets) {
      socket.state.supervisionFlow = {
        resourceId,
        requesterUserId: payload.requesterId,
        requestId,
        approvedSupervisorUserId: null,
        webInitiated: true,
      };
    }

    // Send to every socket for this reader so a stale/disconnecting one cannot swallow the event.
    const acknowledged = await Promise.all(
      sockets.map((socket) =>
        socket
          .sendMessage(
            new AttractapEvent(AttractapEventType.SUPERVISION_START, {
              requestId,
              resourceId,
              requesterUsername: payload.requesterUsername,
              requesterDisplayName: payload.requesterDisplayName,
              timeoutMs: SupervisionService.APPROVAL_TTL_MS,
            }),
          )
          .catch((error) => {
            this.logger.debug(`Failed to send SUPERVISION_START to client ${socket.id}: ${String(error)}`);
            return false;
          }),
      ),
    );

    // A connected-but-unresponsive reader used to arm "successfully": the caller got a 200 and a 30s
    // countdown at a screen that never appeared. One ACK is enough — with several sockets for one
    // reader, the others may legitimately be stale.
    if (!acknowledged.some(Boolean)) {
      for (const socket of sockets) {
        if (socket.state.supervisionFlow?.requestId === requestId) {
          socket.state.supervisionFlow = null;
        }
      }
      throw new BadRequestException('The selected reader did not respond');
    }
    return true;
  }

  /** Reports a web-started request's outcome to the reader, wherever it is connected. Never throws. */
  protected notifyReader(readerId: number, requestId: string, result: Record<string, unknown>): void {
    this.screen.release(readerId, screenOwner('supervision', requestId));
    const payload: NotifyPayload = { readerId, requestId, result };
    this.notifyLocalSockets(payload);
    if (!this.router.cluster.enabled) return;
    void this.router
      .holders(readerId)
      .then((holders) =>
        this.router.onHolders(
          holders.filter((id) => id !== this.router.instanceId),
          { type: NOTIFY, payload, local: async () => undefined, timeoutMs: ROUTE_TIMEOUT_MS },
        ),
      )
      .catch((error: Error) => this.logger.warn(`Could not notify reader ${readerId}: ${error.message}`));
  }

  protected notifyLocalSockets({ readerId, requestId, result }: NotifyPayload): void {
    for (const socket of this.router.localSockets(readerId)) {
      if (socket.state.supervisionFlow?.requestId !== requestId) {
        continue;
      }
      socket.state.supervisionFlow = null;
      void socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, result));
    }
  }

  /** The eligible supervisors for the reader's list: usernames (identity) and, in the same order, display names. */
  protected async getSupervisorNames(
    supervisorIds: number[],
  ): Promise<{ supervisorNames: string[]; supervisorDisplayNames: string[] }> {
    const supervisorNames: string[] = [];
    const supervisorDisplayNames: string[] = [];
    for (const id of supervisorIds) {
      const user = await this.usersService.findOne({ id });
      if (user) {
        supervisorNames.push(user.username);
        supervisorDisplayNames.push(formatUserDisplayName(user));
      }
    }
    return { supervisorNames, supervisorDisplayNames };
  }
}

const ARM = 'supervision.arm';
const NOTIFY = 'supervision.notify';
/** Arming waits for the reader's ACK (with retries) on the holding instance. */
const ROUTE_TIMEOUT_MS = 20_000;
/** The claim outlives the request a little, so it never lapses while the reader still waits. */
const CLAIM_GRACE_MS = 5_000;

interface ArmPayload {
  readerId: number;
  resourceId: number;
  requestId: string;
  requesterId: number;
  requesterUsername: string;
  requesterDisplayName: string;
}

interface NotifyPayload {
  readerId: number;
  requestId: string;
  result: Record<string, unknown>;
}
