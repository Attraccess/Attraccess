import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardClearsResetStateAndPropagatesASendError(
  scope: StartResetOfNfcCardTestScope,
): void {
  it('clears reset state and propagates a send error', async () => {
    const socket = scope.createMockSocket({ sendMessage: jest.fn().mockRejectedValue(new Error('send failed')) });
    scope.websocketService.sockets.set('socket-1', socket);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'send failed',
    );

    expect(socket.state.resetNfcCardData).toBeNull();
  });
}
