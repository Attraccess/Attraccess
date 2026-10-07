import { ReaderLvglStringsImplementation } from './reader-lvgl-strings';
export abstract class WebsocketPublicCommandsImplementation extends ReaderLvglStringsImplementation {
  public async sendResourceList(readerId: number) {
    return this.resourceListService.sendResourceList(readerId);
  }

  public async sendResourceListToReadersWithResources(resourceIds: number[]) {
    return this.resourceListService.sendResourceListToReadersWithResources(resourceIds);
  }

  public async disconnectReader(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await Promise.all(sockets.map((socket) => socket.close()));
  }

  public async startEnrollOfNewNfcCard(data: {
    readerId: number;
    userId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    return this.cardHandler.startEnrollOfNewNfcCard(data);
  }

  public async startResetOfNfcCard(data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    return this.cardHandler.startResetOfNfcCard(data);
  }
}
