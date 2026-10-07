import { AttractapCardHandlerTestScope } from './card.handler.spec';
export function registerAttractapCardHandlerDoesNotClearANewerEnrollmentWhenThePreviousSendFailsLate(
  scope: AttractapCardHandlerTestScope,
): void {
  it('does not clear a newer enrollment when the previous send fails late', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    let finish!: (delivered: boolean) => void;
    socket.sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    const replacement = socket.state.enrollment;
    finish(false);
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
  });
}
