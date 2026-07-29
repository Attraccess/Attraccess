import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, SupervisionMode } from '@attraccess/database-entities';
import { AttractapService } from '../../attractap.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceIntroducersService } from '../../../resources/introducers/resourceIntroducers.service';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
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
 */
@Injectable()
export class AttractapSupervisionHandler {
  private readonly logger = new Logger(AttractapSupervisionHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(ResourceIntroducersService)
  private resourceIntroducersService: ResourceIntroducersService;

  @Inject(SupervisionService)
  private supervisionService: SupervisionService;

  @InjectRepository(Resource)
  private resourceRepository: Repository<Resource>;

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

    const eligibleSupervisorIds = await this.getEligibleSupervisorIds(resourceId, requester.id);
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

  private async getEligibleSupervisorIds(resourceId: number, requesterId: number): Promise<number[]> {
    // Introducers + maintainers of the resource (incl. group-level) are exactly the users who may
    // supervise (see validateSupervisedStart). Global resource managers can still approve if they
    // happen to receive a request, but are not broadcast to here.
    const introducers = await this.resourceIntroducersService.getMany(resourceId);
    const ids = new Set<number>();
    for (const introducer of introducers) {
      if (introducer.userId !== requesterId) {
        ids.add(introducer.userId);
      }
    }
    return Array.from(ids);
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
