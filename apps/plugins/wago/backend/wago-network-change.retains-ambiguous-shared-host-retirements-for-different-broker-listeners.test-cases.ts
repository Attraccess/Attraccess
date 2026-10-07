import { lookup } from 'node:dns/promises';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRetainsAmbiguousSharedHostRetirementsForDifferentBrokerListeners(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('retains ambiguous shared-host retirements for different broker listeners', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    jest.mocked(lookup).mockResolvedValue([{ address: '192.168.4.10', family: 4 }] as never);
    jest.mocked(scope.context.getMqttServerConfig).mockImplementation(async (id) => ({
      id,
      host: 'shared.test',
      name: 'Shared host',
      username: null,
      password: null,
      clientId: null,
      port: id === 1 ? 1883 : 1884,
      useTls: false,
    }));
    await expect(scope.service.retirePreviousCredentials(1, scope.principal)).rejects.toThrow('could not be retired');
    expect(scope.revoke).not.toHaveBeenCalled();
    expect((await scope.service.status(1)).pendingCredentialRetirements).toBe(1);
  });
}
