import { validateSnapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsMalformedChannelDefinitionsBeforeTheyCanReachDeviceControl(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects malformed channel definitions before they can reach device control', () => {
    const errors = validateSnapshot({
      ...scope.snapshot,
      unexpected: true,
      logicalChannels: [
        {
          ...scope.snapshot.logicalChannels[0],
          profile: '',
          capabilities: ['output', 'output', 'unsupported'],
          feedback: { channelId: 'load', expected: 'unknown', timeoutMs: 0 },
          range: { minimum: 1, maximum: 0 },
          measurement: { unit: 'unknown', scale: Number.NaN, offset: Number.NaN },
        },
      ],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_field' }),
        expect.objectContaining({ code: 'invalid_profile' }),
        expect.objectContaining({ code: 'invalid_capabilities' }),
        expect.objectContaining({ code: 'invalid_feedback' }),
        expect.objectContaining({ code: 'invalid_range' }),
        expect.objectContaining({ code: 'invalid_measurement' }),
      ]),
    );
  });
}
