import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardSendsUserNotFoundWhenTheUserDoesNotExist(scope: OnEnrollNewCardTestScope): void {
  it('sends USER_NOT_FOUND when the user does not exist', async () => {
    scope.usersService.findOne.mockResolvedValueOnce(null);
    const socket = scope.createMockSocket({
      state: {
        lastAuthenticatedUserId: 1,
        enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
        enrollNewCardData: {
          userId: 1,
          key: 'deadbeef',
          keyNo: 1,
          cardUID: 'abc',
          auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
        },
      },
    });
    const data = { payload: { success: true } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCard(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD,
          payload: { error: 'USER_NOT_FOUND' },
        }),
      }),
    );
    expect(scope.attractapService.createNFCCard).not.toHaveBeenCalled();
  });
}
