import { AttractapEventType } from '../websocket.types';
import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardStoresResetStateAndSendsResetNfcCardWithTheStoredKeyMaterialOnTheHappyPath(
  scope: StartResetOfNfcCardTestScope,
): void {
  it('stores reset state and sends RESET_NFC_CARD with the stored key material on the happy path', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set('socket-1', socket);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).resolves.toBeUndefined();

    expect(scope.attractapService.findReaderById).toHaveBeenCalledWith(42);
    expect(scope.usersService.findOne).toHaveBeenCalledWith({ id: 1 });
    expect(scope.attractapService.getNFCCardByID).toHaveBeenCalledWith(7);
    expect(socket.state.resetNfcCardData).toEqual({
      cardId: 7,
      key: 'aabbccddeeff00112233445566778899',
      keyNo: 1,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });
    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.RESET_NFC_CARD,
          payload: { username: scope.mockUser.username, keyNo: 1, key: 'aabbccddeeff00112233445566778899' },
        }),
      }),
    );
  });
}
