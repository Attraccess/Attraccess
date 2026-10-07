import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardThrowsWhenThereIsNoConnectedSocket(
  scope: StartResetOfNfcCardTestScope,
): void {
  it('throws when there is no connected socket', async () => {
    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'Reader not connected: 42',
    );
  });
}
