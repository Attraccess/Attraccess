import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestKeepsRequiresSupervisorInTheAuthPayloadForSupervisionAllowedWhenTheUserHasNoIntroduct(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('keeps requiresSupervisor in the auth payload for SUPERVISION_ALLOWED when the user has no introduction', async () => {
    const socket = scope.createMockSocket();
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce(scope.activeCard);
    scope.resourceUsageService.canControllResource.mockResolvedValueOnce(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
    scope.resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_allowed' });
    const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: expect.objectContaining({ supervisionMode: 'supervision_allowed', requiresSupervisor: true }),
        }),
      }),
    );
  });
}
