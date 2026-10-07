/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapCardHandlerTestScope } from './card.handler.spec';
export function registerAttractapCardHandlerDoesNotReviveCancelledEnrollmentAfterS(
  scope: AttractapCardHandlerTestScope,
): void {
  it.each(['lookup', 'key generation'])('does not revive cancelled enrollment after %s', async (stage) => {
    const socket = scope.createMockSocket();
    socket.state.enrollment = { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } };
    let finish!: (value: any) => void;
    const pendingLookup = new Promise((resolve) => {
      finish = resolve;
    });
    (stage === 'lookup'
      ? scope.attractapService.getNFCCardByUID
      : scope.attractapService.generateNTAG424Key
    ).mockReturnValueOnce(pendingLookup);
    const pending = scope.handler.onEnrollNewCardRequestNFCKey(socket, { payload: { uid: 'abc', keyNo: 1 } } as any);
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    finish(stage === 'lookup' ? null : new Uint8Array([1, 2, 3]));
    await pending;
    expect(socket.state.enrollNewCardData).toBeNull();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });
}
