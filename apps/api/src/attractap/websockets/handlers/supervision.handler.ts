import { Resource } from '@attraccess/database-entities';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { WebsocketService } from '../websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { ReaderSupervisorAuthenticationImplementation } from './reader-supervisor-authentication';

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
export class AttractapSupervisionHandler extends ReaderSupervisorAuthenticationImplementation implements OnModuleInit {
  protected readonly logger = new Logger(AttractapSupervisionHandler.name);

  @Inject(AttractapService)
  protected attractapService: AttractapService;

  @Inject(WebsocketService)
  protected websocketService: WebsocketService;

  @Inject(UsersService)
  protected usersService: UsersService;

  @Inject(ResourceUsageService)
  protected resourceUsageService: ResourceUsageService;

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
      await this.supervisionService.approve(flow.requestId, supervisor, null);
    } catch (error) {
      // approve() only invokes the callbacks for failures raised *inside* it — an authorization or
      // not-found throw happens before that, and would leave the reader sitting in its "starting"
      // phase until its own timeout with no explanation. Tell it directly.
      this.logger.debug(`Web-initiated supervision approval failed: ${(error as Error).message}`);
      await fail((error as Error).message ?? 'SUPERVISION_FAILED');
    }
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
}
