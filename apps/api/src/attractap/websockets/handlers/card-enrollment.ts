import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { AttractapCardHandlerRouteContext } from './card.handler.route-context';
export abstract class CardEnrollmentImplementation extends AttractapCardHandlerRouteContext {
  public async startEnrollOfNewNfcCard(data: {
    readerId: number;
    userId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new Error(`Reader does not support card enrollment: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const sockets = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => socket.readerId === data.readerId,
    );

    if (sockets.length === 0) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }
    if (sockets.some((socket) => socket.state.enrollment || socket.state.resetNfcCardData)) {
      throw new Error(`Reader already has an active card operation: ${data.readerId}`);
    }

    // Send to all active sockets for this reader to avoid targeting a stale/disconnecting socket
    const tasks = sockets.map(async (socket) => {
      const authenticationMethod = data.authenticationMethod ?? 'session';
      socket.state.enrollment = {
        userId: user.id,
        auditPrincipal: {
          userId: user.id,
          authenticationMethod,
          ...(authenticationMethod === 'api-token' ? { apiTokenId: data.apiTokenId } : {}),
        },
      };
      const enrollment = socket.state.enrollment;
      try {
        const delivered = await socket.sendMessage(
          new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO, {
            username: user.username,
          }),
        );
        if (!delivered && socket.state.enrollment === enrollment) socket.state.enrollment = null;
      } catch (error) {
        if (socket.state.enrollment === enrollment) socket.state.enrollment = null;
        // Log and continue; other sockets may still deliver the event
        this.logger.debug(
          `Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client ${socket.id}: ${String(error)}`,
        );
      }
    });

    await Promise.allSettled(tasks);
  }

  public async onEnrollNewCardRequestNFCKey(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, keyNo } = data.payload as { uid: string; keyNo: number };

    const enrollment = socket.state.enrollment;
    if (!enrollment) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'USER_NOT_SET' }),
      );
      return;
    }

    if (!uid || typeof uid !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'INVALID_PARAMS' }),
      );
      return;
    }

    const existingCard = await this.attractapService.getNFCCardByUID(uid);
    if (socket.state.enrollment !== enrollment) return;
    if (existingCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'CARD_ALREADY_ENROLLED' }),
      );
      return;
    }

    const key = await this.attractapService.generateNTAG424Key({
      userId: enrollment.userId,
      keyNo,
      cardUID: uid,
    });
    if (socket.state.enrollment !== enrollment) return;

    const keyString = this.attractapService.uint8ArrayToHexString(key);

    socket.state.enrollNewCardData = {
      keyNo,
      key: keyString,
      cardUID: uid,
      auditPrincipal: enrollment.auditPrincipal,
    };
    await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { key: keyString, keyNo }));
  }

  public async onEnrollNewCard(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!socket.state.enrollNewCardData) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'ENROLL_NEW_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const { success } = data.payload as { success: boolean };
    if (!success) {
      // The card write failed on the reader. Drop the stale key material so a
      // retry requests a fresh key, but keep the enrollment snapshot so the
      // reader can re-attempt within the same enrollment session.
      this.logger.error('Enroll new card failed');
      socket.state.enrollNewCardData = null;
      return;
    }

    const cardData = socket.state.enrollNewCardData;
    const enrollment = socket.state.enrollment;
    const { key, keyNo, cardUID, auditPrincipal } = cardData;

    if (!key || typeof key !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'KEY_NOT_SET' }));
      return;
    }

    const user = await this.usersService.findOne({ id: auditPrincipal.userId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'USER_NOT_FOUND' }));
      return;
    }

    const card = await this.attractapService.createNFCCard(user, {
      key,
      keyNo,
      uid: cardUID,
    });
    if (socket.readerId) {
      await this.audit
        .recordAttractap({
          action: 'card.linked',
          actorId: auditPrincipal.userId,
          authenticationMethod: auditPrincipal.authenticationMethod,
          ...(auditPrincipal.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
          subjectId: card.id,
          details: { readerId: socket.readerId, source: 'reader-enrollment' },
        })
        .catch(() => undefined);
    }

    if (socket.state.enrollNewCardData === cardData) {
      socket.state.enrollNewCardData = null;
      if (socket.state.enrollment === enrollment) socket.state.enrollment = null;
      socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { success: true }));
    }
  }

  // Reader actively cancelled (user pressed cancel) or the enrollment timed out.
  // Clear all enrollment state so a stale key/user can't leak into a later flow.
  public async onEnrollNewCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Enroll new card cancelled by reader');
    socket.state.enrollNewCardData = null;
    socket.state.enrollment = null;
  }
}
