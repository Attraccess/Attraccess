import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { MassIntroductionService } from '../../../../resources/mass-introductions/mass-introduction.service';
import { MassIntroductionEndReason } from '../../../../resources/mass-introductions/dtos/massIntroductionLiveEvent.dto';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { AttractapService } from '../../../attractap.service';
import { CardOperationsService } from '../../card-operations.service';
import { WebsocketService } from '../../websocket.service';
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

  public onModuleInit(): void {
    this.massIntroductionService.setReaderPort({
      arm: (params) => this.armReader(params),
      disarm: (params) => this.disarmReader(params),
    });
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
    const stillShowing = Array.from(this.websocketService.sockets.values()).some(
      (other) =>
        other !== socket &&
        other.readerId === readerId &&
        other.state.massIntroductionFlow?.sessionId === flow.sessionId,
    );
    if (!stillShowing) {
      this.massIntroductionService.detachReader(flow.sessionId, readerId);
    }
  }

  protected async armReader(params: {
    readerId: number;
    allowedResourceIds: number[];
    sessionId: string;
    targetName: string;
    introducerUsername: string;
    expiresAt: Date;
  }): Promise<{ readerName: string }> {
    const { readerId, sessionId } = params;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader) {
      throw new NotFoundException(`Reader not found: ${readerId}`);
    }
    // Every reader that can enroll cards can run the scan flow; readers without a screen just cannot
    // show its progress.
    if (!reader.firmware?.capabilities?.cardEnrollment) {
      throw new BadRequestException('This reader does not support mass introductions');
    }
    // A mass introduction must not take over readers elsewhere (e.g. a door) for 15 minutes.
    if (!(reader.resources ?? []).some((resource) => params.allowedResourceIds.includes(resource.id))) {
      throw new ForbiddenException('The selected reader is not linked to this resource');
    }

    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }

    // Readers on firmware before 2.0.0 cannot relay card commands, so they cannot check a card.
    if (sockets.some((socket) => !socket.state.cardRelay)) {
      throw new BadRequestException('This reader needs a firmware update before it can check cards');
    }

    // Checked before the socket state below: an await between the busy check and the claim would
    // let two concurrent arms both pass (see the supervision handler).
    for (const linkedResource of reader.resources ?? []) {
      if (await this.resourceUsageService.getActiveSession(linkedResource.id)) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

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
      targetName: params.targetName,
      introducerUsername: params.introducerUsername,
      remainingMs: Math.max(0, params.expiresAt.getTime() - Date.now()),
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

    return { readerName: reader.name };
  }

  protected disarmReader(params: { readerId: number; sessionId: string; reason: MassIntroductionEndReason }): void {
    for (const socket of this.websocketService.sockets.values()) {
      if (socket.readerId !== params.readerId || socket.state.massIntroductionFlow?.sessionId !== params.sessionId) {
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
