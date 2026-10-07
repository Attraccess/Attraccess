import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { managedSsh } from './wago-managed-ssh';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerChangesOnlyTheStoredAddressUsingNewIpSshWithoutTheOldIpBrokerHeartbeatOrCredentials(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('changes only the stored address using new-IP SSH, without the old IP, broker, heartbeat or credentials', async () => {
    const result = await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: null }, scope.principal);
    expect(result).toMatchObject({ targetHost: scope.newHost, mqttServerId: 1, operation: { phase: 'completed' } });
    expect(scope.provision).not.toHaveBeenCalled();
    expect(scope.context.mqtt.refreshConnection).not.toHaveBeenCalled();
    expect(scope.wago.blockRuntime).not.toHaveBeenCalled();
    expect(scope.context.getMqttServerConfig).not.toHaveBeenCalled();
    expect(scope.payloads).toEqual([]);
    for (const [access] of jest.mocked(managedSsh).mock.calls)
      expect(access).toMatchObject({ host: scope.newHost, fingerprint: scope.fingerprint });
    expect(await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
      targetHost: scope.newHost,
      mqttServerId: 1,
      state: 'completed',
    });
    const envelope = await scope.db
      .getRepository(WagoManagedAccess)
      .createQueryBuilder('a')
      .addSelect('a.encryptedCredentials')
      .getOne();
    if (!envelope) throw new Error('Missing managed envelope');
    expect(JSON.parse(scope.context.secrets.decrypt(envelope.encryptedCredentials)).host).toBe(scope.newHost);
  });
}
