import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeIgnoresMalformedCommandSWithoutPerformingDeviceWrites(
  scope: WagoRuntimeTestScope,
): void {
  it.each(['{', 'null', '{}', '{"id":"bad","channelId":"load","action":"unexpected"}'])(
    'ignores malformed command %s without performing device writes',
    async (payload) => {
      const write = jest.spyOn(scope.device, 'write');
      const before = scope.transport.published.length;
      await expect(scope.runtime.receiveCommand(Buffer.from(payload))).resolves.toBeUndefined();
      expect(write).not.toHaveBeenCalled();
      expect(scope.transport.published).toHaveLength(before);
    },
  );
}
