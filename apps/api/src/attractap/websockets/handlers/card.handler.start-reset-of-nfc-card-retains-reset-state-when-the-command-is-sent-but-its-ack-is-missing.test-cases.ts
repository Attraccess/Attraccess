import { AttractapEvent } from '../websocket.types';
import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardRetainsResetStateWhenTheCommandIsSentButItsAckIsMissing(
  scope: StartResetOfNfcCardTestScope,
): void {
  it('retains reset state when the command is sent but its ACK is missing', async () => {
    const socket = scope.createMockSocket({ sendMessage: jest.fn().mockResolvedValue(false) });
    scope.websocketService.sockets.set('socket-1', socket);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).resolves.toBeUndefined();

    expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 7 }));
    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'Reader already has an active card operation: 42',
    );

    await scope.handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

    expect(scope.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'card.unlinked',
        subjectId: 7,
      }),
    );
    expect(socket.state.resetNfcCardData).toBeNull();
  });
}
