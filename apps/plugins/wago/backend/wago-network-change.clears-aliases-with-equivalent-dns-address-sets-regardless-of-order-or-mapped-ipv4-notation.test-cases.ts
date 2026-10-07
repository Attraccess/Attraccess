import { lookup } from 'node:dns/promises';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerClearsAliasesWithEquivalentDnsAddressSetsRegardlessOfOrderOrMappedIpv4Notation(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('clears aliases with equivalent DNS address sets regardless of order or mapped IPv4 notation', async () => {
    await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    jest.mocked(lookup).mockImplementation(
      async (host: string) =>
        (host === 'unreachable-old.test'
          ? [
              { address: '192.168.4.10', family: 4 },
              { address: '192.168.5.10', family: 4 },
            ]
          : [
              { address: '::ffff:192.168.5.10', family: 6 },
              { address: '192.168.4.10', family: 4 },
            ]) as never,
    );
    expect(await scope.service.retirePreviousCredentials(1, scope.principal)).toMatchObject({ pendingCredentialRetirements: 0 });
    expect(scope.revoke).not.toHaveBeenCalled();
  });
}
