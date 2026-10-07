import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { CardEnrollmentImplementation } from './card-enrollment';
export abstract class CardResetImplementation extends CardEnrollmentImplementation {
  // Reader actively cancelled (user pressed cancel) or the enrollment timed out.
  // Clear all enrollment state so a stale key/user can't leak into a later flow.

  public async startResetOfNfcCard(data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.readerId === data.readerId,
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }
    const nfcCard = await this.attractapService.getNFCCardByID(data.cardId);

    if (!nfcCard) {
      throw new Error(`NFC card not found: ${data.cardId}`);
    }
    if (socket.state.enrollment || socket.state.resetNfcCardData) {
      throw new Error(`Reader already has an active card operation: ${data.readerId}`);
    }

    // Hand the reader everything it needs to reset the card in one go: the
    // stored key + slot let it authenticate the card and write the factory key
    // back, so — unlike enrollment — no extra key round-trip is required. The
    // cardId is kept in socket state so we know which DB record to delete once
    // the reader confirms the on-card reset succeeded.
    socket.state.resetNfcCardData = {
      cardId: nfcCard.id,
      key: nfcCard.key,
      keyNo: nfcCard.keyNo,
      auditPrincipal: {
        userId: user.id,
        authenticationMethod: data.authenticationMethod ?? 'session',
        ...(data.authenticationMethod === 'api-token' ? { apiTokenId: data.apiTokenId } : {}),
      },
    };
    const reset = socket.state.resetNfcCardData;

    try {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESET_NFC_CARD, {
          username: nfcCard.user.username,
          keyNo: nfcCard.keyNo,
          key: nfcCard.key,
        }),
      );
    } catch (error) {
      if (socket.state.resetNfcCardData === reset) socket.state.resetNfcCardData = null;
      this.logger.debug(`Failed to send RESET_NFC_CARD to client ${socket.id}: ${String(error)}`);
      throw error;
    }
  }

  public async onResetNfcCard(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!socket.state.resetNfcCardData) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { error: 'RESET_NFC_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const { success } = data.payload as { success: boolean };
    if (!success) {
      this.logger.error('Reset of NFC card failed on reader');
      // Keep the reset data: the reader stays on its screen and may retry the
      // write with the same card within the timeout.
      return;
    }

    const reset = socket.state.resetNfcCardData;
    const { cardId, auditPrincipal } = reset;

    // The card was wiped back to the factory key on the reader; drop the DB
    // record so the (now blank) card is no longer recognised.
    const result = await this.attractapService.deleteNFCCard(cardId);
    if (result.affected && socket.readerId && auditPrincipal) {
      await this.audit
        .recordAttractap({
          action: 'card.unlinked',
          actorId: auditPrincipal.userId,
          authenticationMethod: auditPrincipal.authenticationMethod,
          ...(auditPrincipal.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
          subjectId: cardId,
          details: { readerId: socket.readerId, source: 'reader-reset' },
        })
        .catch(() => undefined);
    }

    if (socket.state.resetNfcCardData === reset) {
      socket.state.resetNfcCardData = null;
      socket.sendMessage(new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { success: true }));
    }
  }

  // Reader actively cancelled (user pressed cancel) or the reset timed out.
  // Clear the reset state so a stale cardId can't leak into a later flow.
  public async onResetNfcCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Reset of NFC card cancelled by reader');
    socket.state.resetNfcCardData = null;
  }
}
