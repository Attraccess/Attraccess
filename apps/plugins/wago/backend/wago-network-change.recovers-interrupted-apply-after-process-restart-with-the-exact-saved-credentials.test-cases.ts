import { WagoNetworkChangeService } from './wago-network-change.service';
import { WagoService } from './wago.service';
import { RuntimeUpdateError } from './wago-runtime-update';
import { managedSsh } from './wago-managed-ssh';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRecoversInterruptedApplyAfterProcessRestartWithTheExactSavedCredentials(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('recovers interrupted apply after process restart with the exact saved credentials', async () => {
    scope.failure = 'apply';
    await expect(scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal)).rejects.toThrow('incomplete');
    await expect(scope.managed.assertNetworkSettled(1)).rejects.toThrow('pending');
    expect(await scope.service.status(1)).toMatchObject({ targetHost: scope.oldHost, mqttServerId: 1 });
    scope.failure = null;
    scope.brokerHost = 'subsequent-edit.test';
    const transport = jest.mocked(managedSsh).getMockImplementation();
    if (!transport) throw new Error('Missing SSH fixture');
    jest.mocked(managedSsh).mockImplementation((...args) => {
      if (args[2].startsWith('inspect ')) throw new RuntimeUpdateError('offline'); // Container was deleted before interruption.
      return transport(...args);
    });
    const restarted = new WagoNetworkChangeService(scope.context, scope.managed, scope.wago as unknown as WagoService);
    expect(await restarted.apply(1, null, scope.principal, true)).toMatchObject({
      mqttServerId: 2,
      operation: { phase: 'completed' },
    });
    expect(scope.provision).toHaveBeenCalledTimes(1);
    expect(scope.payloads[1]).toEqual(scope.payloads[0]);
  });
}
