import {
  BadRequestException,
  ConflictException,
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
import { WebsocketService } from '../../websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';

/**
 * Reader side of mass introductions (ATT-1151). The reader shows a scan screen; each tapped card
 * is crypto-authenticated like a supervisor card (UID lookup, key handed out, reader confirms)
 * before its owner is introduced, because a bare UID can be cloned.
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

  @Inject(MassIntroductionService)
  protected massIntroductionService: MassIntroductionService;

  public onModuleInit(): void {
    this.massIntroductionService.setReaderPort({
      arm: (params) => this.armReader(params),
      disarm: (params) => this.disarmReader(params),
    });
  }

  public async handleCardAuthRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, sessionId } = (data.payload ?? {}) as { uid?: string; sessionId?: string };
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(
        new AttractapEvent(AttractapEventType.MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA, { sessionId, ...payload }),
      );

    const flow = socket.state.massIntroductionFlow;
    if (!flow || flow.sessionId !== sessionId) {
      await reply({ error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
      return;
    }
    if (!uid || typeof uid !== 'string') {
      await reply({ error: 'INVALID_UID' });
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(uid);
    if (!nfcCard) {
      await reply({ error: 'CARD_NOT_FOUND' });
      return;
    }
    if (!nfcCard.isActive) {
      await reply({ error: 'CARD_NOT_ACTIVE' });
      return;
    }

    // The flow may have ended while the card was looked up.
    if (socket.state.massIntroductionFlow !== flow) {
      await reply({ error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
      return;
    }
    flow.pendingCard = { uid, userId: nfcCard.user.id };
    await reply({ keyNo: nfcCard.keyNo, key: nfcCard.key, username: nfcCard.user.username });
  }

  public async handleCardAuthConfirmed(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, sessionId } = (data.payload ?? {}) as { uid?: string; sessionId?: string };
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(new AttractapEvent(AttractapEventType.MASS_INTRODUCTION_RESULT, { sessionId, ...payload }));

    const flow = socket.state.massIntroductionFlow;
    if (!flow || flow.sessionId !== sessionId || socket.readerId == null) {
      await reply({ success: false, error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
      return;
    }
    const pendingCard = flow.pendingCard;
    flow.pendingCard = null;
    if (!pendingCard || pendingCard.uid !== uid) {
      await reply({ success: false, error: 'CARD_MISMATCH' });
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(pendingCard.uid);
    if (!nfcCard?.isActive || nfcCard.user.id !== pendingCard.userId) {
      await reply({ success: false, error: 'CARD_NOT_ACTIVE' });
      return;
    }

    try {
      const { participant, participantCount } = await this.massIntroductionService.redeemCard(
        flow.sessionId,
        socket.readerId,
        nfcCard.user,
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

  /** Reader cancel button: the reader leaves, the QR code keeps working. */
  public async handleCancel(socket: AuthenticatedWebSocket) {
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

    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
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
          socket.state.enrollNewCardData ||
          socket.state.resetNfcCardData,
      )
    ) {
      throw new ConflictException('The selected reader is busy with another operation');
    }
    for (const socket of sockets) {
      socket.state.massIntroductionFlow = { sessionId, pendingCard: null };
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
