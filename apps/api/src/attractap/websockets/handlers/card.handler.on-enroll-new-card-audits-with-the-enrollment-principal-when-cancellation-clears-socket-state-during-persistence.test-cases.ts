import { AttractapEvent } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardAuditsWithTheEnrollmentPrincipalWhenCancellationClearsSocketStateDuringPersistence(
  scope: OnEnrollNewCardTestScope,
): void {
  it('audits with the enrollment principal when cancellation clears socket state during persistence', async () => {
    let resolveUser!: (user: typeof scope.mockUser) => void;
    scope.usersService.findOne.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        }),
    );
    const socket = scope.createMockSocket({
      state: {
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

    const enrollment = scope.handler.onEnrollNewCard(socket, { payload: { success: true } } as AttractapEvent['data']);
    await scope.handler.onEnrollNewCardCancel(socket);
    resolveUser(scope.mockUser);
    await enrollment;

    expect(scope.audit.recordAttractap).toHaveBeenCalledWith({
      action: 'card.linked',
      actorId: 1,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 8,
      details: { readerId: 42, source: 'reader-enrollment' },
    });
  });
}
