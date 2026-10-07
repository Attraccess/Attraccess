import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestFlagsRequiresSupervisorForASupervisionRequiredResourceEvenWhenIntroduced(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('flags requiresSupervisor for a SUPERVISION_REQUIRED resource even when introduced', async () => {
    const socket = scope.createMockSocket();
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce(scope.activeCard);
    scope.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
    scope.resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_required' });
    const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: expect.objectContaining({ supervisionMode: 'supervision_required', requiresSupervisor: true }),
        }),
      }),
    );
  });
}
