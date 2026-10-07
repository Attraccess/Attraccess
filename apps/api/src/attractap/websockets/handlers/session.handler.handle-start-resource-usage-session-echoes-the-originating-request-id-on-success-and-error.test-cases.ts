import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionEchoesTheOriginatingRequestIdOnSuccessAndError(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('echoes the originating request id on success and error', async () => {
    const request = { ...scope.eventData, payload: { ...scope.eventData.payload, requestId: 880 } };
    await scope.handler.handleStartResourceUsageSession(scope.mockSocket, request);
    expect(scope.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
      success: true,
      requestId: 880,
    });
    expect(scope.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 880 }),
    );
    scope.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('Start failed'));
    await scope.handler.handleStartResourceUsageSession(scope.mockSocket, {
      ...request,
      payload: { ...request.payload, requestId: 881 },
    });
    expect(scope.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
      error: 'Start failed',
      requestId: 881,
    });
  });
}
