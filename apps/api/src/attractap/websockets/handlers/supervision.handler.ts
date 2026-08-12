import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, SupervisionMode, User } from '@attraccess/database-entities';
import { AttractapService } from '../../attractap.service';
import { WebsocketService } from '../websocket.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import {
  ReaderSupervisionCallbacks,
  SupervisionService,
} from '../../../resources/supervision/supervision.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

/**
 * Two-card supervision at the reader (ATT-493).
 *
 * After a non-introduced user taps their card (handled by {@link AttractapCardHandler}), the reader
 * asks the server to open a supervision request. The request is fanned out to every eligible
 * supervisor over SSE (so they can approve from their phone/PC) while the reader simultaneously
 * waits for one of them to tap their card. Whichever channel resolves first wins:
 *
 * - Web approval → {@link SupervisionService} starts the session and calls back here to tell the
 *   reader the session is live.
 * - Supervisor card tap → validated here, the reader then crypto-authenticates the supervisor card
 *   and sends START_RESOURCE_USAGE_SESSION; the session-start handler attaches the supervisor and
 *   settles the still-open web request.
 *
 * ATT-816 adds a third entry point: the requester starts in the web UI and picks a reader, which the
 * server arms directly (no first tap). Everything downstream is shared, with one difference — the
 * requester is not at the reader, so the reader confirms the card auth and the session is started by
 * approving the pending request rather than by the reader's own session-start message.
 */
@Injectable()
export class AttractapSupervisionHandler implements OnModuleInit {
  private readonly logger = new Logger(AttractapSupervisionHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(SupervisionService)
  private supervisionService: SupervisionService;

  @InjectRepository(Resource)
  private resourceRepository: Repository<Resource>;

  /**
   * Registers this handler as the service's reader-arming port. A registration hook rather than an
   * injected dependency, because SupervisionService cannot depend on the Attractap module without
   * closing a cycle (this handler already injects the service).
   */
  public onModuleInit(): void {
    this.supervisionService.setReaderArmer({ arm: (params) => this.armReader(params) });
  }

  /**
   * Web-initiated supervision (ATT-816): put a reader into its supervisor-card wait state on behalf
   * of a requester who is using the web UI. Nobody has tapped a card here, so the requester comes
   * from the HTTP session and the reader is told not to start the session itself.
   */
  private async armReader(params: {
    readerId: number;
    resourceId: number;
    requester: User;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks> {
    const { readerId, resourceId, requester, requestId } = params;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader) {
      throw new NotFoundException(`Reader not found: ${readerId}`);
    }

    // Supervision draws its whole UI on the reader's screen; display-less readers cannot run it.
    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new BadRequestException('This reader does not support supervisor authentication');
    }

    const sockets = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => socket.readerId === readerId,
    );
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }

    // A live session is something a user would notice losing. Asked of the source of truth rather
    // than mirrored into socket state, so it cannot go stale.
    //
    // Checked BEFORE the socket state below, deliberately: this is a DB round-trip, and an await
    // between the socket check and the assignment would let two concurrent arms of the same reader
    // both pass and the second silently overwrite the first.
    for (const linkedResource of reader.resources ?? []) {
      if (await this.resourceUsageService.getActiveSession(linkedResource.id, false)) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

    // --- no awaits from here to the assignment, so check-and-claim stays atomic ---

    // "Busy" also means a sub-flow that owns the screen. Deliberately NOT keyed on
    // `lastAuthenticatedUserId`: that records the last card ever tapped on this socket and is only
    // cleared by the enrollment paths, so it survives for the life of the websocket. Using it would
    // make every reader that has been touched once permanently "busy".
    if (
      sockets.some(
        (socket) => socket.state.supervisionFlow || socket.state.enrollNewCardData || socket.state.resetNfcCardData,
      )
    ) {
      throw new ConflictException('The selected reader is busy with another operation');
    }

    for (const socket of sockets) {
      socket.state.supervisionFlow = {
        resourceId,
        requesterUserId: requester.id,
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
              requesterUsername: requester.username,
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

    const notifyReader = (payload: Record<string, unknown>) => {
      for (const socket of sockets) {
        if (socket.state.supervisionFlow?.requestId !== requestId) {
          continue;
        }
        socket.state.supervisionFlow = null;
        void socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, payload));
      }
    };

    return {
      onResolved: (_session, supervisor) =>
        notifyReader({ success: true, resourceId, supervisorUsername: supervisor.username }),
      onFailed: (error) =>
        notifyReader({ success: false, resourceId, error: error?.message ?? 'SUPERVISION_FAILED' }),
    };
  }

  /**
   * Reader confirms it crypto-authenticated the supervisor's card for a web-initiated flow. The
   * requester is not here, so the reader must not start the session — approving the pending web
   * request does it, and resolves the requester's blocked call.
   */
  public async handleSupervisorCardAuthConfirmed(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = (data.payload ?? {}) as { resourceId?: number };

    const flow = socket.state.supervisionFlow;
    const fail = async (error: string) => {
      // Tear the server-side request down alongside the socket state — the two belong together (see
      // cancelForSocket). Leaving it pending would make the requester wait out the full TTL for a
      // generic timeout instead of this reason, and block them from arming any reader until it
      // expired. Safe no-op when approve() already settled the request itself.
      if (flow?.requestId) {
        this.supervisionService.cancelReaderRequest(flow.requestId, `Supervision failed at the reader: ${error}`);
      }
      socket.state.supervisionFlow = null;
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, { success: false, error }));
    };

    if (!flow?.requestId || !flow.approvedSupervisorUserId) {
      await fail('NO_SUPERVISION_IN_PROGRESS');
      return;
    }

    // The reader states which resource it authenticated for; refuse a confirmation that has drifted
    // from the flow this socket is actually running.
    if (resourceId != null && resourceId !== flow.resourceId) {
      await fail('RESOURCE_MISMATCH');
      return;
    }

    const supervisor = await this.usersService.findOne({ id: flow.approvedSupervisorUserId });
    if (!supervisor) {
      await fail('USER_NOT_FOUND');
      return;
    }

    try {
      // On success the armer's callbacks report SUPERVISION_RESOLVED, so nothing to send here.
      await this.supervisionService.approve(flow.requestId, supervisor);
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
    const { resourceId } = data.payload as { resourceId: number };

    const requesterUserId = socket.state.lastAuthenticatedUserId;
    if (!requesterUserId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_SET' }),
      );
      return;
    }

    const requester = await this.usersService.findOne({ id: requesterUserId });
    if (!requester) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'RESOURCE_NOT_FOUND' }));
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

    const { requestId, expiresAt } = this.supervisionService.createReaderRequest({
      resourceId,
      requester,
      // No notes/project from the reader's two-card flow.
      dto: {},
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

    createdRequestId = requestId;
    socket.state.supervisionFlow = {
      resourceId,
      requesterUserId: requester.id,
      requestId,
      approvedSupervisorUserId: null,
    };

    const supervisorNames = await this.getSupervisorNames(eligibleSupervisorIds);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, {
        success: true,
        requestId,
        expiresAt: expiresAt.toISOString(),
        timeoutMs: SupervisionService.APPROVAL_TTL_MS,
        supervisorNames,
      }),
    );
  }

  /**
   * Reader presents a supervisor card. Validate the supervisor against the resource and (on success)
   * hand back the card's key material so the reader can crypto-authenticate the physical card. The
   * session itself starts only after the reader confirms the auth via START_RESOURCE_USAGE_SESSION.
   */
  public async handleSupervisorCardAuthRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, resourceId } = data.payload as { uid: string; resourceId: number };

    const flow = socket.state.supervisionFlow;
    if (!flow || flow.resourceId !== resourceId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'NO_SUPERVISION_IN_PROGRESS' }),
      );
      return;
    }

    if (!uid || typeof uid !== 'string') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'INVALID_UID' }),
      );
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(uid);
    if (!nfcCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'CARD_NOT_FOUND' }),
      );
      return;
    }

    if (!nfcCard.isActive) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'CARD_NOT_ACTIVE' }),
      );
      return;
    }

    const requester = await this.usersService.findOne({ id: flow.requesterUserId });
    if (!requester) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    try {
      // Reuses the Phase-1 guard: resource supports supervision, supervisor != requester, and the
      // supervisor is an introducer/maintainer (or a global resource manager).
      await this.resourceUsageService.validateSupervisedStart(resourceId, requester, nfcCard.user.id);
    } catch (error) {
      this.logger.debug(`Supervisor card rejected for resource ${resourceId}: ${(error as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, {
          error: 'SUPERVISOR_NOT_AUTHORIZED',
        }),
      );
      return;
    }

    socket.state.supervisionFlow = { ...flow, approvedSupervisorUserId: nfcCard.user.id };

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, {
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
        username: nfcCard.user.username,
      }),
    );
  }

  /** Reader aborted (cancel button / its own 30s timeout). Tear down the pending web request. */
  public async handleSupervisionCancel(socket: AuthenticatedWebSocket) {
    this.cancelForSocket(socket);
  }

  /** Cancels any in-progress supervision flow for this socket (also used on disconnect). */
  public cancelForSocket(socket: AuthenticatedWebSocket): void {
    const requestId = socket.state.supervisionFlow?.requestId;
    if (requestId) {
      this.supervisionService.cancelReaderRequest(requestId);
    }
    socket.state.supervisionFlow = null;
  }

  private async getSupervisorNames(supervisorIds: number[]): Promise<string[]> {
    const names: string[] = [];
    for (const id of supervisorIds) {
      const user = await this.usersService.findOne({ id });
      if (user) {
        names.push(user.username);
      }
    }
    return names;
  }
}
