import { lookup } from 'node:dns/promises';
import { WagoManagedAccess } from './wago-managed-access.entity';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerClearsRedundantBrokerAliasesWithoutRevokingTheActiveCredentials(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('clears redundant broker aliases without revoking the active credentials', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    jest.mocked(lookup).mockResolvedValue([{ address: '192.168.4.10', family: 4 }] as never);
    await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retired' });
    expect(await scope.service.retirePreviousCredentials(1, scope.principal)).toMatchObject({ pendingCredentialRetirements: 0 });
    expect(scope.revoke).not.toHaveBeenCalled();
    await expect(scope.managed.assertRemovable(1)).resolves.toBeUndefined();
  });
}
