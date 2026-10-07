import { WagoNetworkChange } from './wago-network-change.entity';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRecoversAnAmbiguousAcknowledgementAfterAtomicAddressAndBrokerCommit(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('recovers an ambiguous acknowledgement after atomic address and broker commit', async () => {
    scope.failure = 'ack';
    await expect(scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal)).rejects.toThrow('incomplete');
    expect(await scope.service.status(1)).toMatchObject({
      targetHost: scope.newHost,
      mqttServerId: 2,
      operation: { phase: 'saving' },
    });
    scope.failure = null;
    await scope.service.apply(1, null, scope.principal, true);
    expect(scope.payloads).toHaveLength(1);
    expect(scope.provision).toHaveBeenCalledTimes(1);
    expect(await scope.db.getRepository(WagoNetworkChange).findOneByOrFail({ controllerId: 1 })).toMatchObject({
      phase: 'completed',
    });
  });
}
