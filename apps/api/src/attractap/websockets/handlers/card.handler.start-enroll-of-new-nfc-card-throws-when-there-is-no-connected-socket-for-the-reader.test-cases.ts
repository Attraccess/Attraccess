import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardThrowsWhenThereIsNoConnectedSocketForTheReader(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('throws when there is no connected socket for the reader', async () => {
    const otherSocket = scope.createMockSocket({ id: 'other', readerId: 99 });
    scope.websocketService.sockets.set('other', otherSocket);

    await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
      'Reader not connected: 42',
    );
  });
}
