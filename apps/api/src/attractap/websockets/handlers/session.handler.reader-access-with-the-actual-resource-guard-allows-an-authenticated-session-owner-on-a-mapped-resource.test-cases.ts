/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { ReaderAccessWithTheActualResourceGuardTestScope } from './session.handler.spec';
export function registerReaderAccessWithTheActualResourceGuardAllowsAnAuthenticatedSessionOwnerOnAMappedResource(
  scope: ReaderAccessWithTheActualResourceGuardTestScope,
): void {
  it('allows an authenticated session owner on a mapped resource', async () => {
    await scope.parentScope.handler.handleResourceUsageStats(scope.parentScope.mockSocket as any, scope.request);
    expect(scope.parentScope.metering.getLive).toHaveBeenCalledWith(10);
    expect(scope.parentScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toMatchObject({
      id: 99,
      meters: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 2, formattedRate: '0,02 EUR', value: '0.125' }],
      operatingDurationMs: 120000,
    });
  });
}
