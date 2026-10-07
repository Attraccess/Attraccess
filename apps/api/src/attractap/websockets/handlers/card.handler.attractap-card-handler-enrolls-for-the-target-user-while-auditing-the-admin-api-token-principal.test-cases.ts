import { AttractapEvent } from '../websocket.types';
import { AttractapCardHandlerTestScope } from './card.handler.spec';
export function registerAttractapCardHandlerEnrollsForTheTargetUserWhileAuditingTheAdminApiTokenPrincipal(
  scope: AttractapCardHandlerTestScope,
): void {
  it('enrolls for the target user while auditing the admin API-token principal', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    await scope.handler.startEnrollOfNewNfcCard({
      readerId: 42,
      userId: 1,
      actorId: 99,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
    await scope.handler.onEnrollNewCardRequestNFCKey(socket, {
      payload: { uid: 'abc', keyNo: 1 },
    } as AttractapEvent['data']);
    await scope.handler.onEnrollNewCard(socket, { payload: { success: true } } as AttractapEvent['data']);
    expect(scope.attractapService.generateNTAG424Key).toHaveBeenCalledWith({ userId: 1, cardUID: 'abc', keyNo: 1 });
    expect(scope.usersService.findOne).toHaveBeenLastCalledWith({ id: 1 });
    expect(scope.attractapService.createNFCCard).toHaveBeenCalledWith(scope.mockUser, {
      uid: 'abc',
      key: 'deadbeef',
      keyNo: 1,
    });
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 99, authenticationMethod: 'api-token', apiTokenId: 9 }),
    );
  });
}
