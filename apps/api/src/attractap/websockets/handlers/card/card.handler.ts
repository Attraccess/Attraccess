import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

/** ATT-950 supplies the verifier and on-card migration; reader claims never authorize writes. */
@Injectable()
export class AttractapCardHandler {
  private clear(socket: AuthenticatedWebSocket): void {
    if (!socket.state) return;
    socket.state.lastAuthenticatedUserId = null;
    socket.state.enrollment = null;
    socket.state.enrollNewCardData = null;
    socket.state.resetNfcCardData = null;
  }

  private async deny(socket: AuthenticatedWebSocket, type: AttractapEventType): Promise<void> {
    this.clear(socket);
    await socket.sendMessage(new AttractapEvent(type, { error: 'CARD_VERIFICATION_UNAVAILABLE' }));
  }

  public async handleCardAuthenticationRequest(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.CARD_AUTHENTICATION_DATA);
  }

  public async startResetOfNfcCard(_data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    throw new ForbiddenException('CARD_VERIFICATION_UNAVAILABLE');
  }

  public async startEnrollOfNewNfcCard(_data: {
    readerId: number;
    userId: number;
    actorId?: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    throw new ForbiddenException('CARD_VERIFICATION_UNAVAILABLE');
  }

  public async onResetNfcCard(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.RESET_NFC_CARD);
  }
  public async onEnrollNewCardRequestNFCKey(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY);
  }
  public async onEnrollNewCard(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.ENROLL_NEW_CARD);
  }
  public async onResetNfcCardCancel(socket: AuthenticatedWebSocket) {
    this.clear(socket);
  }
  public async onEnrollNewCardCancel(socket: AuthenticatedWebSocket) {
    this.clear(socket);
  }
}
