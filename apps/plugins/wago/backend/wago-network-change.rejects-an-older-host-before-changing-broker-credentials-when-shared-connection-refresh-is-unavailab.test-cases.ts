import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRejectsAnOlderHostBeforeChangingBrokerCredentialsWhenSharedConnectionRefreshIsUnavailab(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('rejects an older host before changing broker credentials when shared-connection refresh is unavailable', async () => {
    scope.context.mqtt.refreshConnection = undefined;
    await expect(scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal)).rejects.toThrow('incomplete');
    expect(scope.provision).not.toHaveBeenCalled();
    expect(scope.payloads).toEqual([]);
    expect(await scope.service.status(1)).toMatchObject({
      mqttServerId: 1,
      targetHost: scope.oldHost,
      operation: { failure: 'host_connection' },
    });
  });
}
