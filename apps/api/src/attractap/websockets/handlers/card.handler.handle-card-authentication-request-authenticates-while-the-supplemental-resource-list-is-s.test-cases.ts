/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestAuthenticatesWhileTheSupplementalResourceListIsS(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it.each(['pending', 'failed'])('authenticates while the supplemental resource list is %s', async (state) => {
    const socket = scope.createMockSocket();
    const failure = new Error('Resource list unavailable');
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce(scope.activeCard);
    (scope.handler as any).resourceListService.sendResourceListToSocket.mockImplementation(() =>
      state === 'pending' ? new Promise(() => undefined) : Promise.reject(failure),
    );

    await scope.handler.handleCardAuthenticationRequest(socket, {
      payload: { uid: 'abc', resourceId: 10 },
    } as AttractapEvent['data']);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: expect.objectContaining({ key: scope.activeCard.key, username: scope.activeCard.user.username }),
        }),
      }),
    );
    if (state === 'failed')
      expect((scope.handler as any).logger.error).toHaveBeenCalledWith(expect.any(String), failure);
  });
}
