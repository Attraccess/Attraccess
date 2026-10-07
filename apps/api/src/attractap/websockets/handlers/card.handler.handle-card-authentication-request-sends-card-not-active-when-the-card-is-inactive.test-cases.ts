import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestSendsCardNotActiveWhenTheCardIsInactive(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('sends CARD_NOT_ACTIVE when the card is inactive', async () => {
    const socket = scope.createMockSocket();
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce({ ...scope.activeCard, isActive: false });
    const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: { error: 'CARD_NOT_ACTIVE' },
        }),
      }),
    );
    expect(scope.resourceUsageService.canControllResource).not.toHaveBeenCalled();
  });
}
