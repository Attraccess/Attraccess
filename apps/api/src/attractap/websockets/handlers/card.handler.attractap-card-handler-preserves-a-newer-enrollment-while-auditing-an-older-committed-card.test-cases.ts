/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapCardHandlerTestScope } from './card.handler.spec';
export function registerAttractapCardHandlerPreservesANewerEnrollmentWhileAuditingAnOlderCommittedCard(
  scope: AttractapCardHandlerTestScope,
): void {
  it('preserves a newer enrollment while auditing an older committed card', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    const principal = { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 };
    socket.state.enrollment = { userId: 1, auditPrincipal: principal };
    socket.state.enrollNewCardData = {
      userId: 1,
      key: 'deadbeef',
      keyNo: 1,
      cardUID: 'abc',
      auditPrincipal: principal,
    };
    let finish!: (value: { id: number }) => void;
    scope.attractapService.createNFCCard.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = scope.handler.onEnrollNewCard(socket, { payload: { success: true } } as any);
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    scope.usersService.findOne.mockResolvedValueOnce({ id: 2, username: 'second' });
    await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 2 });
    const replacement = socket.state.enrollment;
    finish({ id: 8 });
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
    expect(replacement.userId).toBe(2);
    expect(scope.audit.recordAttractap).toHaveBeenCalledTimes(1);
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 1, apiTokenId: 9, subjectId: 8 }),
    );
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
  });
}
