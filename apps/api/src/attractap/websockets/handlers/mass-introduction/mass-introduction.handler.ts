import { formatUserDisplayName } from '@attraccess/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { MassIntroductionService } from '../../../../resources/mass-introductions/mass-introduction.service';
import { MassIntroductionEndReason } from '../../../../resources/mass-introductions/dtos/massIntroductionLiveEvent.dto';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { AttractapService } from '../../../attractap.service';
import { assertReaderPaired } from '../../../reader-pairing';
import { CardOperationsService } from '../../card-operations.service';
import { assertReaderRelaysCards } from '../card/card-write-errors';
import { WebsocketService } from '../../websocket.service';
import { ReaderRouter, armFailure } from '../../reader-router';
import { rethrowValkeyUnavailable } from '../../../../cluster/valkey-call';
import { ReaderScreenService, screenOwner } from '../../reader-screen.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket, CardDetection } from '../../websocket.types';

/**
 * Reader side of mass introductions (ATT-1151). The reader shows a scan screen; each tapped card
 * is authenticated by the server (EV2 with the stored key, relayed through the reader) before its
 * owner is introduced, because a bare UID can be cloned.
 */
@Injectable()
export class AttractapMassIntroductionHandler implements OnModuleInit {
  protected readonly logger = new Logger(AttractapMassIntroductionHandler.name);

  @Inject(AttractapService)
  protected attractapService: AttractapService;

  @Inject(WebsocketService)
  protected websocketService: WebsocketService;

  @Inject(ResourceUsageService)
  protected resourceUsageService: ResourceUsageService;

  @Inject(CardOperationsService)
  protected cardOperations: CardOperationsService;

  @Inject(MassIntroductionService)
  protected massIntroductionService: MassIntroductionService;

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
    this.massIntroductionService.setReaderPort({
      arm: (params) => this.armReader(params),
      disarm: (params) => this.disarmReader(params),
    });
    // Other instances reach the sockets of readers this instance holds through these.
    this.router.handle(ARM, (payload: ArmPayload) => this.armLocalSockets(payload));
    this.router.handle(DISARM, (payload: DisarmPayload) => this.disarmLocalSockets(payload));
    this.router.handle(
      SHOWING,
      (payload: { readerId: number; sessionId: string }) =>
        this.localSocketsShowing(payload.readerId, payload.sessionId).length > 0,
    );
    this.screen.onLost('mass-introduction', (readerId, sessionId) =>
      this.massIntroductionService.detachReader(sessionId, readerId),
    );
  }

  /** A card was tapped on the scan screen: the server authenticates it before its owner is introduced. */
  public async handleCardDetected(
    socket: AuthenticatedWebSocket,
    detection: CardDetection,
    sessionId: string | undefined,
  ) {
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(new AttractapEvent(AttractapEventType.MASS_INTRODUCTION_RESULT, { sessionId, ...payload }));

    const flow = socket.state.massIntroductionFlow;
    if (!flow || flow.sessionId !== sessionId || socket.readerId == null) {
      await reply({ success: false, error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
      return;
    }

    const verified = await this.cardOperations.verifyCard(socket, 'mass-introduction', detection);
    if (!verified.ok) {
      await reply({ success: false, error: verified.error });
      return;
    }
    // The flow may have ended while the card was checked.
    if (socket.state.massIntroductionFlow !== flow) {
      await reply({ success: false, error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
      return;
    }

    try {
      const { participant, participantCount } = await this.massIntroductionService.redeemCard(
        flow.sessionId,
        socket.readerId,
        verified.card.user,
      );
      await reply({
        success: true,
        username: participant.username,
        displayName: formatUserDisplayName(verified.card.user),
        alreadyIntroduced: participant.alreadyIntroduced,
        participantCount,
      });
    } catch (error) {
      this.logger.debug(`Mass introduction card rejected: ${(error as Error).message}`);
      await reply({
        success: false,
        error: error instanceof NotFoundException ? 'NO_MASS_INTRODUCTION_IN_PROGRESS' : 'MASS_INTRODUCTION_FAILED',
      });
    }
  }

  /**
   * Reader cancel button, or the reader refusing a start: the reader leaves, the QR code keeps
   * working. Only the session the reader names is left — a refusal of an older start must not detach
   * the session the reader shows now.
   */
  public async handleCancel(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { sessionId } = (data?.payload ?? {}) as { sessionId?: string };
    if (sessionId !== socket.state.massIntroductionFlow?.sessionId) {
      return;
    }
    this.cancelForSocket(socket);
  }

  /** Also used on disconnect, which clears `socket.readerId` first and passes the old id. */
  public cancelForSocket(socket: AuthenticatedWebSocket, readerId: number | null = socket.readerId): void {
    const flow = socket.state.massIntroductionFlow;
    socket.state.massIntroductionFlow = null;
    if (!flow || readerId == null) {
      return;
    }
    const stillShowing = this.localSocketsShowing(readerId, flow.sessionId).some((other) => other !== socket);
    if (stillShowing) {
      return;
    }
    if (!this.router.cluster.enabled) {
      void this.massIntroductionService.detachReader(flow.sessionId, readerId);
      return;
    }
    // A socket of the reader on another instance may still show the session.
    void this.detachUnlessShownElsewhere(readerId, flow.sessionId).catch((error: Error) =>
      this.logger.warn(
        `Could not detach reader ${readerId} from mass introduction ${flow.sessionId}: ${error.message}`,
      ),
    );
  }

  private async detachUnlessShownElsewhere(readerId: number, sessionId: string): Promise<void> {
    const others = (await this.router.holders(readerId)).filter((id) => id !== this.router.instanceId);
    const answers = await this.router.onHolders<boolean>(others, {
      type: SHOWING,
      payload: { readerId, sessionId },
      local: async () => false,
      timeoutMs: ROUTE_TIMEOUT_MS,
    });
    if (answers.some((answer) => answer.ok && answer.value)) return;
    this.screen.release(readerId, screenOwner('mass-introduction', sessionId));
    await this.massIntroductionService.detachReader(sessionId, readerId);
  }

  private localSocketsShowing(readerId: number, sessionId: string): AuthenticatedWebSocket[] {
    return this.router
      .localSockets(readerId)
      .filter((socket) => socket.state?.massIntroductionFlow?.sessionId === sessionId);
  }

  protected async armReader(params: {
    readerId: number;
    allowedResourceIds: number[];
    sessionId: string;
    targetName: string;
    introducerUsername: string;
    introducerDisplayName?: string;
    expiresAt: Date;
  }): Promise<{ readerName: string }> {
    const { readerId, sessionId } = params;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader) {
      throw new NotFoundException(`Reader not found: ${readerId}`);
    }
    assertReaderPaired(reader);
    // Every reader that can enroll cards can run the scan flow; readers without a screen just cannot
    // show its progress.
    if (!reader.firmware?.capabilities?.cardEnrollment) {
      throw new BadRequestException('This reader does not support mass introductions');
    }
    // A mass introduction must not take over readers elsewhere (e.g. a door) for 15 minutes.
    if (!(reader.resources ?? []).some((resource) => params.allowedResourceIds.includes(resource.id))) {
      throw new ForbiddenException('The selected reader is not linked to this resource');
    }

    const holders = await this.router.holders(readerId).catch(rethrowValkeyUnavailable);
    if (holders.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }
    // Readers on firmware before 2.0.0 cannot relay card commands, so they cannot check a card. Sockets on other
    // instances are checked there.
    const local = this.router.localSockets(readerId);
    if (local.length > 0) assertReaderRelaysCards(local);

    // Checked before the socket state below: an await between the busy check and the claim would
    // let two concurrent arms both pass (see the supervision handler).
    for (const linkedResource of reader.resources ?? []) {
      if (await this.resourceUsageService.getActiveSession(linkedResource.id)) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

    // One flow per reader screen across all instances; released when the session ends or the reader leaves.
    const owner = screenOwner('mass-introduction', sessionId);
    const ttlMs = Math.max(0, params.expiresAt.getTime() - Date.now()) + CLAIM_GRACE_MS;
    if (!(await this.screen.claim(readerId, owner, ttlMs))) {
      throw new ConflictException('The selected reader is busy with another operation');
    }

    const payload: ArmPayload = {
      readerId,
      sessionId,
      targetName: params.targetName,
      introducerUsername: params.introducerUsername,
      introducerDisplayName: params.introducerDisplayName ?? params.introducerUsername,
      expiresAt: params.expiresAt.getTime(),
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
    return { readerName: reader.name };
  }

  /** Shows the scan screen on this instance's sockets of the reader. Throws like a single instance always did. */
  protected async armLocalSockets(payload: ArmPayload): Promise<true> {
    const { readerId, sessionId } = payload;
    const sockets = this.router.localSockets(readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }
    assertReaderRelaysCards(sockets);

    // --- no awaits from here to the assignment, so check-and-claim stays atomic ---
    if (
      sockets.some(
        (socket) =>
          socket.state.massIntroductionFlow ||
          socket.state.supervisionFlow ||
          socket.state.enrollment ||
          socket.state.resetNfcCardData,
      )
    ) {
      throw new ConflictException('The selected reader is busy with another operation');
    }
    for (const socket of sockets) {
      socket.state.massIntroductionFlow = { sessionId };
    }

    const start = new AttractapEvent(AttractapEventType.MASS_INTRODUCTION_START, {
      sessionId,
      targetName: payload.targetName,
      introducerUsername: payload.introducerUsername,
      introducerDisplayName: payload.introducerDisplayName,
      remainingMs: Math.max(0, payload.expiresAt - Date.now()),
    });
    const acknowledged = await Promise.all(
      sockets.map((socket) =>
        socket.sendMessage(start).catch((error) => {
          this.logger.debug(`Failed to send MASS_INTRODUCTION_START to client ${socket.id}: ${String(error)}`);
          return false;
        }),
      ),
    );

    // One ACK is enough; with several sockets for one reader, the others may be stale.
    if (!acknowledged.some(Boolean)) {
      for (const socket of sockets) {
        if (socket.state.massIntroductionFlow?.sessionId === sessionId) {
          socket.state.massIntroductionFlow = null;
        }
      }
      throw new BadRequestException('The selected reader did not respond');
    }

    // A busy reader ACKs the start and immediately refuses it with MASS_INTRODUCTION_CANCEL, which
    // can be handled before this resumes — while the session does not know its reader yet.
    if (!sockets.some((socket) => socket.state.massIntroductionFlow?.sessionId === sessionId)) {
      throw new ConflictException('The selected reader is busy with another operation');
    }
    return true;
  }

  /** Returns the reader to its normal screen wherever it is connected. Never throws. */
  protected disarmReader(params: DisarmPayload): void {
    this.screen.release(params.readerId, screenOwner('mass-introduction', params.sessionId));
    this.disarmLocalSockets(params);
    if (!this.router.cluster.enabled) return;
    void this.router
      .holders(params.readerId)
      .then((holders) =>
        this.router.onHolders(
          holders.filter((id) => id !== this.router.instanceId),
          { type: DISARM, payload: params, local: async () => undefined, timeoutMs: ROUTE_TIMEOUT_MS },
        ),
      )
      .catch((error: Error) => this.logger.warn(`Could not disarm reader ${params.readerId}: ${error.message}`));
  }

  protected disarmLocalSockets(params: DisarmPayload): void {
    for (const socket of this.router.localSockets(params.readerId)) {
      if (socket.state.massIntroductionFlow?.sessionId !== params.sessionId) {
        continue;
      }
      socket.state.massIntroductionFlow = null;
      void socket
        .sendMessage(
          new AttractapEvent(AttractapEventType.MASS_INTRODUCTION_END, {
            sessionId: params.sessionId,
            reason: params.reason,
          }),
        )
        .catch(() => false);
    }
  }
}

const ARM = 'mass-introduction.arm';
const DISARM = 'mass-introduction.disarm';
const SHOWING = 'mass-introduction.showing';
/** Arming waits for the reader's ACK (with retries) on the holding instance. */
const ROUTE_TIMEOUT_MS = 20_000;
/** The claim outlives the session a little, so it never lapses while the session still shows. */
const CLAIM_GRACE_MS = 5_000;

interface ArmPayload {
  readerId: number;
  sessionId: string;
  targetName: string;
  introducerUsername: string;
  introducerDisplayName: string;
  expiresAt: number;
}

interface DisarmPayload {
  readerId: number;
  sessionId: string;
  reason: MassIntroductionEndReason;
}
