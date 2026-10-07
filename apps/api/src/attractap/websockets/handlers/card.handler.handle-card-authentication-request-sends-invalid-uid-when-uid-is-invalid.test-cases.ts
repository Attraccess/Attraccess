import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestSendsInvalidUidWhenUidIsInvalid(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('sends INVALID_UID when uid is invalid', async () => {
    const socket = scope.createMockSocket();
    const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: { error: 'INVALID_UID' },
        }),
      }),
    );
    expect(scope.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
  });
}
