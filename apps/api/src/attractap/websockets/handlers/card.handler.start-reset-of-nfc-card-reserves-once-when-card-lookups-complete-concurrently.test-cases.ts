/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardReservesOnceWhenCardLookupsCompleteConcurrently(
  scope: StartResetOfNfcCardTestScope,
): void {
  it('reserves once when card lookups complete concurrently', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    scope.usersService.findOne.mockImplementation(({ id }) => Promise.resolve({ id, username: `user-${id}` }));
    let finish!: (card: any) => void;
    scope.attractapService.getNFCCardByID
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce({ id: 8, key: 'second-key', keyNo: 2, user: scope.mockUser });
    const first = scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }).catch((error) => error);
    await new Promise(setImmediate);
    await scope.handler.startResetOfNfcCard({ readerId: 42, userId: 2, cardId: 8 });
    finish({ id: 7, key: 'first-key', keyNo: 1, user: scope.mockUser });
    expect(await first).toEqual(
      expect.objectContaining({ message: 'Reader already has an active card operation: 42' }),
    );
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    await scope.handler.onResetNfcCard(socket, { payload: { success: true } } as any);
    expect(scope.attractapService.deleteNFCCard).toHaveBeenCalledWith(8);
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(expect.objectContaining({ actorId: 2, subjectId: 8 }));
  });
}
