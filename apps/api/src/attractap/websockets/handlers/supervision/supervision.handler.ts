import { Resource, SupervisionMode, User } from '@attraccess/database-entities';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { SupervisionService, ReaderSupervisionCallbacks } from '../../../../resources/supervision/supervision.service';

import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';

import { UsersService } from '../../../../users-and-auth/users/users.service';

import { AttractapService } from '../../../attractap.service';

import { CardOperationsService } from '../../card-operations.service';
import { WebsocketService } from '../../websocket.service';

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

  @InjectRepository(Resource)
  protected resourceRepository: Repository<Resource>;

  /**
   * Registers this handler as the service's reader-arming port. A registration hook rather than an
   * injected dependency, because SupervisionService cannot depend on the Attractap module without
   * closing a cycle (this handler already injects the service).
   */
  public onModuleInit(): void {
    this.supervisionService.setReaderArmer({ arm: (params) => this.armReader(params) });
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
      await this.approveWebRequest(socket, socket.state.supervisionFlow, nfcCard.user);
      return;
    }
    await reply({ username: nfcCard.user.username });
  }

  /**
   * The requester is not at the reader (web-started flow), so the reader must not start the session
   * — approving the pending web request does it, and resolves the requester's blocked call.
   */
  private async approveWebRequest(
    socket: AuthenticatedWebSocket,
    flow: NonNullable<AuthenticatedWebSocket['state']['supervisionFlow']>,
    supervisor: User,
  ) {
    const fail = async (error: string) => {
      // Tear the server-side request down alongside the socket state — the two belong together (see
      // cancelForSocket). Leaving it pending would make the requester wait out the full TTL for a
      // generic timeout instead of this reason. Safe no-op when approve() already settled the request.
      if (flow.requestId) {
        this.supervisionService.cancelReaderRequest(flow.requestId, `Supervision failed at the reader: ${error}`);
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
    const { resourceId } = data.payload as { resourceId: number };

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

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
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
   * Web-initiated supervision (ATT-816): put a reader into its supervisor-card wait state on behalf
   * of a requester who is using the web UI. Nobody has tapped a card here, so the requester comes
   * from the HTTP session and the reader is told not to start the session itself.
   */
  protected async armReader(params: {
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

    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }

    // Readers on firmware before 2.0.0 cannot relay card commands, so they cannot check a card.
    if (sockets.some((socket) => !socket.state.cardRelay)) {
      throw new BadRequestException('This reader needs a firmware update before it can check cards');
    }

    // A live session is something a user would notice losing. Asked of the source of truth rather
    // than mirrored into socket state, so it cannot go stale.
    //
    // Checked BEFORE the socket state below, deliberately: this is a DB round-trip, and an await
    // between the socket check and the assignment would let two concurrent arms of the same reader
    // both pass and the second silently overwrite the first.
    for (const linkedResource of reader.resources ?? []) {
      if (await this.resourceUsageService.getActiveSession(linkedResource.id)) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

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
      onFailed: (error) => notifyReader({ success: false, resourceId, error: error?.message ?? 'SUPERVISION_FAILED' }),
    };
  }

  protected async getSupervisorNames(supervisorIds: number[]): Promise<string[]> {
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
