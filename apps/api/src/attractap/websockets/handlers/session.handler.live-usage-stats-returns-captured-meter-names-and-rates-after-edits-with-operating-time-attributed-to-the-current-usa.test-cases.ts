/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType, AttractapEvent } from '../websocket.types';
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsReturnsCapturedMeterNamesAndRatesAfterEditsWithOperatingTimeAttributedToTheCurrentUsa(
  scope: LiveUsageStatsTestScope,
): void {
  it('returns captured meter names and rates after edits, with operating time attributed to the current usage', async () => {
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.operating.getForResource).toHaveBeenCalledWith(10, expect.any(Date), scope.startTime);
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, {
        resourceId: 10,
        requestId: 7,
        usage: {
          id: 99,
          meters: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 2, formattedRate: '0,02 EUR', value: '0.125' }],
          operatingDurationMs: 120000,
          isOperating: true,
        },
      }),
    );
  });
}
