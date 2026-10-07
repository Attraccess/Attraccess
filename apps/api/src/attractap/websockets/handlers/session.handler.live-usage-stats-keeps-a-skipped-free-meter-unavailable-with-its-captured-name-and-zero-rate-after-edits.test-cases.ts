/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsKeepsASkippedFreeMeterUnavailableWithItsCapturedNameAndZeroRateAfterEdits(
  scope: LiveUsageStatsTestScope,
): void {
  it('keeps a skipped free meter unavailable with its captured name and zero rate after edits', async () => {
    scope.metering.getLive.mockResolvedValue({
      meters: [
        {
          id: 1,
          name: 'Renamed Heartbeats',
          creditsPerUnit: 100,
          session: {
            sessionId: null,
            usageId: 99,
            meterName: 'Heartbeats',
            creditsPerUnit: 0,
            latestValue: null,
          },
        },
      ],
    });
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters).toEqual([
      { id: 1, name: 'Heartbeats', creditsPerUnit: 0, formattedRate: '0,00 EUR', value: null },
    ]);
  });
}
