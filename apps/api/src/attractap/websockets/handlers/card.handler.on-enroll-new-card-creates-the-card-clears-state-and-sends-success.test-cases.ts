import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardCreatesTheCardClearsStateAndSendsSuccess(scope: OnEnrollNewCardTestScope): void {
  it('creates the card, clears state and sends success', async () => {
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

    expect(scope.attractapService.createNFCCard).toHaveBeenCalledWith(scope.mockUser, {
      key: 'deadbeef',
      keyNo: 1,
      uid: 'abc',
    });
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith({
      action: 'card.linked',
      actorId: 1,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 8,
      details: { readerId: 42, source: 'reader-enrollment' },
    });
    expect(socket.state.enrollNewCardData).toBeNull();
    expect(socket.state.enrollment).toBeNull();
    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD,
          payload: { success: true },
        }),
      }),
    );
  });
}
