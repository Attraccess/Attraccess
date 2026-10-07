import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardThrowsWhenTheNfcCardIsNotFound(scope: StartResetOfNfcCardTestScope): void {
  it('throws when the nfc card is not found', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set('socket-1', socket);
    scope.attractapService.getNFCCardByID.mockResolvedValueOnce(null);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'NFC card not found: 7',
    );
  });
}
