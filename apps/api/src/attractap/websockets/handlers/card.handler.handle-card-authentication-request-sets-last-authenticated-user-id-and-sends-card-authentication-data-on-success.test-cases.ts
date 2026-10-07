import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestSetsLastAuthenticatedUserIdAndSendsCardAuthenticationDataOnSuccess(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('sets lastAuthenticatedUserId and sends CARD_AUTHENTICATION_DATA on success', async () => {
    const socket = scope.createMockSocket();
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce(scope.activeCard);
    scope.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(true);
    scope.rbacService.getEffectivePermissions.mockResolvedValueOnce(new Set(['resources.update']));
    const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(socket.state.lastAuthenticatedUserId).toBe(scope.activeCard.user.id);
    expect(scope.resourceUsageService.canControllResource).toHaveBeenCalledWith(10, scope.activeCard.user);
    expect(scope.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(10, scope.activeCard.user.id, true);
    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: {
            keyNo: scope.activeCard.keyNo,
            key: scope.activeCard.key,
            username: scope.activeCard.user.username,
            canManageResource: true,
            hasIntroduction: true,
            isIntroducer: true,
            supervisionMode: 'introduction_required',
            requiresSupervisor: false,
          },
        }),
      }),
    );
  });
}
