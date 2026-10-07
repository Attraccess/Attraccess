import { AttractapEventType } from '../websocket.types';
import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardStoresTheEnrollmentPrincipalAndSendsEnrollNewCardGetAvailableKeyNo(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('stores the enrollment principal and sends ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set('socket-1', socket);

    await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });

    expect(socket.state.enrollment).toEqual({
      userId: scope.mockUser.id,
      auditPrincipal: { userId: scope.mockUser.id, authenticationMethod: 'session' },
    });
    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
          payload: { username: scope.mockUser.username },
        }),
      }),
    );
  });
}
