import { Inject, Injectable, Logger } from '@nestjs/common';
import { CardConversationService } from './card-conversation.service';
import { AttractapCardHandler } from './handlers/card/card.handler';
import { AttractapMassIntroductionHandler } from './handlers/mass-introduction/mass-introduction.handler';
import { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket, CardDetection } from './websocket.types';

const MAX_DETECTION_ID = 0xffffffff;

const REPLY_TYPES: Record<string, AttractapEventType> = {
  tap: AttractapEventType.CARD_AUTHENTICATION_DATA,
  enroll: AttractapEventType.ENROLL_NEW_CARD,
  reset: AttractapEventType.RESET_NFC_CARD,
  supervisor: AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA,
  'mass-introduction': AttractapEventType.MASS_INTRODUCTION_RESULT,
};

const isDetectionId = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_DETECTION_ID;

@Injectable()
export class CardDetectedRouter {
  private readonly logger = new Logger(CardDetectedRouter.name);

  @Inject(AttractapCardHandler)
  private readonly cardHandler: AttractapCardHandler;

  @Inject(AttractapSupervisionHandler)
  private readonly supervisionHandler: AttractapSupervisionHandler;

  @Inject(AttractapMassIntroductionHandler)
  private readonly massIntroductionHandler: AttractapMassIntroductionHandler;

  @Inject(CardConversationService)
  private readonly conversations: CardConversationService;

  /**
   * A card is on the reader: route it to the flow that asked for it. The server then talks to the
   * card through the reader. Whatever happens, the reader is told afterwards that the server is done
   * with this detection (CARD_CONVERSATION_END with its detectionId), so it never waits for APDUs
   * that will not come.
   */
  async route(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) {
    const { purpose, uid, resourceId, sessionId, detectionId } = (eventData.payload ?? {}) as {
      purpose?: string;
      uid?: unknown;
      resourceId?: unknown;
      sessionId?: unknown;
      detectionId?: unknown;
    };
    // A login tap replaces whoever was logged in, whether or not the new card checks out.
    if (purpose === 'tap') this.cardHandler.clearVerifiedUser(socket);

    const replyType = Object.hasOwn(REPLY_TYPES, purpose ?? '') ? REPLY_TYPES[purpose as string] : undefined;
    const validDetectionId = isDetectionId(detectionId);
    try {
      if (!replyType) {
        this.logger.warn(`Ignoring CARD_DETECTED with unknown purpose from client ${socket.id}`);
        return;
      }
      const fail = async (error: string) => {
        await socket.sendMessage(new AttractapEvent(replyType, { error }));
      };

      if (!socket.state.cardRelay) return await fail('FIRMWARE_UPDATE_REQUIRED');
      if (!validDetectionId) return await fail('INVALID_PARAMS');
      this.conversations.noteDetection(socket, detectionId);
      if (typeof uid !== 'string' || !/^[0-9a-fA-F]{4,32}$/.test(uid)) return await fail('INVALID_UID');
      if ((purpose === 'tap' || purpose === 'supervisor') && !Number.isInteger(resourceId)) {
        return await fail('INVALID_PARAMS');
      }
      // Before any database work: a flood of detections must not cost queries.
      if (this.conversations.isBusy(socket)) return await fail('BUSY');

      const detection: CardDetection = { uid, detectionId };
      switch (purpose) {
        case 'tap':
          return await this.cardHandler.handleCardTap(socket, detection, resourceId as number);
        case 'enroll':
          return await this.cardHandler.handleEnrollCard(socket, detection);
        case 'reset':
          return await this.cardHandler.handleResetCard(socket, detection);
        case 'supervisor':
          return await this.supervisionHandler.handleSupervisorCardDetected(socket, detection, resourceId as number);
        default:
          return await this.massIntroductionHandler.handleCardDetected(
            socket,
            detection,
            typeof sessionId === 'string' ? sessionId : undefined,
          );
      }
    } finally {
      // Only relay firmware sends CARD_DETECTED, so the END is safe even before FIRMWARE_INFO arrived.
      if (validDetectionId) {
        socket.sendRaw?.(new AttractapEvent(AttractapEventType.CARD_CONVERSATION_END, { detectionId }));
      }
    }
  }
}
