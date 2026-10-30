import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapCardHandler } from './handlers/card/card.handler';
import { AttractapMassIntroductionHandler } from './handlers/mass-introduction/mass-introduction.handler';
import { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

@Injectable()
export class CardDetectedRouter {
  private readonly logger = new Logger(CardDetectedRouter.name);

  @Inject(AttractapCardHandler)
  private readonly cardHandler: AttractapCardHandler;

  @Inject(AttractapSupervisionHandler)
  private readonly supervisionHandler: AttractapSupervisionHandler;

  @Inject(AttractapMassIntroductionHandler)
  private readonly massIntroductionHandler: AttractapMassIntroductionHandler;

  /** A card is on the reader: route it to the flow that asked for it. The server then talks to the card through the reader. */
  async route(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) {
    const { purpose, uid, resourceId, sessionId } = (eventData.payload ?? {}) as {
      purpose?: string;
      uid?: unknown;
      resourceId?: unknown;
      sessionId?: unknown;
    };
    const replyTypes: Record<string, AttractapEventType> = {
      tap: AttractapEventType.CARD_AUTHENTICATION_DATA,
      enroll: AttractapEventType.ENROLL_NEW_CARD,
      reset: AttractapEventType.RESET_NFC_CARD,
      supervisor: AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA,
      'mass-introduction': AttractapEventType.MASS_INTRODUCTION_RESULT,
    };
    const replyType = replyTypes[purpose ?? ''];
    if (!replyType) {
      this.logger.warn(`Ignoring CARD_DETECTED with unknown purpose from client ${socket.id}`);
      return;
    }
    const fail = (error: string) => socket.sendMessage(new AttractapEvent(replyType, { error }));

    if (!socket.state.cardRelay) return void (await fail('FIRMWARE_UPDATE_REQUIRED'));
    if (typeof uid !== 'string' || !/^[0-9a-fA-F]{4,32}$/.test(uid)) return void (await fail('INVALID_UID'));

    switch (purpose) {
      case 'tap':
        if (!Number.isInteger(resourceId)) return void (await fail('INVALID_PARAMS'));
        return this.cardHandler.handleCardTap(socket, uid, resourceId as number);
      case 'enroll':
        return this.cardHandler.handleEnrollCard(socket, uid);
      case 'reset':
        return this.cardHandler.handleResetCard(socket, uid);
      case 'supervisor':
        if (!Number.isInteger(resourceId)) return void (await fail('INVALID_PARAMS'));
        return this.supervisionHandler.handleSupervisorCardDetected(socket, uid, resourceId as number);
      default:
        return this.massIntroductionHandler.handleCardDetected(
          socket,
          uid,
          typeof sessionId === 'string' ? sessionId : undefined,
        );
    }
  }
}
