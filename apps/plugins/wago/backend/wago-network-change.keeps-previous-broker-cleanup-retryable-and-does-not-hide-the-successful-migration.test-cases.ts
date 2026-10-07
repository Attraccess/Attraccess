import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerKeepsPreviousBrokerCleanupRetryableAndDoesNotHideTheSuccessfulMigration(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('keeps previous broker cleanup retryable and does not hide the successful migration', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    await expect(scope.service.retirePreviousCredentials(1, scope.principal)).rejects.toThrow('could not be retired');
    expect(await scope.service.status(1)).toMatchObject({
      operation: { phase: 'completed' },
      pendingCredentialRetirements: 1,
    });
    scope.revoke.mockResolvedValue(undefined);
    expect(await scope.service.retirePreviousCredentials(1, scope.principal)).toMatchObject({ pendingCredentialRetirements: 0 });
  });
}
