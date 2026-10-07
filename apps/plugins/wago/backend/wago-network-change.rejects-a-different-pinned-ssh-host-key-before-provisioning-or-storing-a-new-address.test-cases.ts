import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRejectsADifferentPinnedSshHostKeyBeforeProvisioningOrStoringANewAddress(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('rejects a different pinned SSH host key before provisioning or storing a new address', async () => {
    scope.failure = 'host_identity';
    await expect(scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal)).rejects.toThrow('incomplete');
    expect(scope.provision).not.toHaveBeenCalled();
    expect(await scope.service.status(1)).toMatchObject({
      targetHost: scope.oldHost,
      mqttServerId: 1,
      operation: { failure: 'host_identity' },
    });
  });
}
