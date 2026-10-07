/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardSwallowsASendMessageRejectionPromiseAllSettledAndLogsIt(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('swallows a sendMessage rejection (Promise.allSettled) and logs it', async () => {
    const socket = scope.createMockSocket();
    socket.sendMessage.mockRejectedValueOnce(new Error('send failed'));
    scope.websocketService.sockets.set('socket-1', socket);

    await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).resolves.toBeUndefined();

    expect(socket.state.enrollment).toBeNull();
    expect((scope.handler as any).logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client socket-1'),
    );
  });
}
