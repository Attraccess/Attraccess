import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerKeepsPendingChangesExclusiveAfterInterruptionIncludingANewCommissioningSessionWithOnlyT(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('keeps pending changes exclusive after interruption, including a new commissioning session with only the pinned fingerprint', async () => {
    scope.failure = 'apply';
    await expect(scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal)).rejects.toThrow('incomplete');
    await expect(scope.managed.assertNetworkSettled(1)).rejects.toThrow('pending MQTT/address change');
    await expect(scope.managed.assertNetworkSettled(null, scope.fingerprint)).rejects.toThrow('pending MQTT/address change');
    await expect(scope.managed.assertNetworkSettled(null, `SHA256:${'b'.repeat(43)}`)).resolves.toBeUndefined();
    await expect(scope.managed.assertNetworkSettled(null)).resolves.toBeUndefined();
  });
}
