import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerMatchesCompanionUsbSFiltersBeforeStartingFlowsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it.each(['connected', 'disconnected'] as const)(
    'matches companion USB %s filters before starting flows',
    async (kind) => {
      const type =
        kind === 'connected'
          ? ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED
          : ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED;
      const filters = [
        { deviceId: 7 },
        { deviceId: 7, vendorId: 10 },
        { deviceId: 7, productId: 20 },
        { deviceId: 7, vendorId: 10, productId: 20 },
        { deviceId: 7, vendorId: 99 },
        { deviceId: 7, productId: 99 },
        { deviceId: 8 },
        {},
      ];
      fixture.initialNodes = filters.map((data, index) => fixture.createNode({ id: String(index), type, data }));
      const start = jest
        .spyOn(fixture.service as never as { startFlow: (...args: unknown[]) => Promise<void> }, 'startFlow')
        .mockResolvedValue(undefined);
      const event = { deviceId: 7, payload: { vendorId: 10, productId: 20 } };
      if (kind === 'connected') await fixture.service.handleCompanionUsbConnected(event);
      else await fixture.service.handleCompanionUsbDisconnected(event);
      expect(start).toHaveBeenCalledWith(fixture.initialNodes.slice(0, 4), { payload: event.payload });
    },
  );
}
