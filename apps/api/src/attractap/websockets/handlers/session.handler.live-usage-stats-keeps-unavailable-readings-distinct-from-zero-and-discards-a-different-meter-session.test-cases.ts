/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsKeepsUnavailableReadingsDistinctFromZeroAndDiscardsADifferentMeterSession(
  scope: LiveUsageStatsTestScope,
): void {
  it('keeps unavailable readings distinct from zero and discards a different meter session', async () => {
    scope.metering.getLive.mockResolvedValue({
      meters: [{ id: 1, name: 'Heartbeats', session: { usageId: 100, latestValue: '9' } }],
    });
    scope.operating.getForResource.mockResolvedValue({ operatingDataAvailable: false, attributions: [] });
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toEqual({
      id: 99,
      meters: [],
      operatingDurationMs: null,
      isOperating: null,
    });
  });
}
