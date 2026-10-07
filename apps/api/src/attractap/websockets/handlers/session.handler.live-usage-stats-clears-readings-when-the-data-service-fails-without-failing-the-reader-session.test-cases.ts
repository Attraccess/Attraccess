/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsClearsReadingsWhenTheDataServiceFailsWithoutFailingTheReaderSession(
  scope: LiveUsageStatsTestScope,
): void {
  it('clears readings when the data service fails without failing the reader session', async () => {
    scope.metering.getLive.mockRejectedValue(new Error('database unavailable'));
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
  });
}
