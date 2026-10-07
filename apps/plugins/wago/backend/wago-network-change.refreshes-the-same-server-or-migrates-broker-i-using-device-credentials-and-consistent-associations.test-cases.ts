import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRefreshesTheSameServerOrMigratesBrokerIUsingDeviceCredentialsAndConsistentAssociations(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it.each([1, 2])(
    'refreshes the same server or migrates broker %i using device credentials and consistent associations',
    async (mqttServerId) => {
      if (mqttServerId === 1)
        jest.mocked(scope.context.getMqttServerConfig).mockResolvedValueOnce({
          id: 1,
          name: 'Current server',
          host: 'refreshed-current.test',
          port: 1883,
          useTls: false,
          username: 'admin',
          password: 'broker-management-secret',
          clientId: null,
        });
      const result = await scope.service.apply(1, { targetHost: scope.newHost, mqttServerId }, scope.principal);
      expect(result).toMatchObject({ targetHost: scope.newHost, mqttServerId, operation: { phase: 'completed' } });
      const payload = JSON.parse(scope.payloads[0].toString());
      expect(payload.url).toBe(`mqtt://${mqttServerId === 1 ? 'refreshed-current.test' : scope.brokerHost}:1883`);
      expect(scope.provision).toHaveBeenCalledWith(
        expect.objectContaining({ mqttServerId, identity: 'wago-controller-cc100-1' }),
      );
      expect(scope.context.mqtt.refreshConnection).toHaveBeenCalledWith(mqttServerId);
      expect(await scope.db.getRepository(WagoController).findOneByOrFail({ id: 1 })).toMatchObject({
        mqttServerId,
        credentialMqttServerId: mqttServerId,
        credentialEpoch: payload.credentialEpoch,
        enrollmentId: 42,
        name: 'Workshop',
        lastSequence: 300,
      });
      expect(await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
        mqttServerId,
        targetHost: scope.newHost,
        state: 'completed',
      });
      expect(await scope.db.getRepository(WagoCredentialRotationEntity).findOneByOrFail({ controllerId: 1 })).toMatchObject({
        mqttServerId,
        phase: 'completed',
        credentialEpoch: payload.credentialEpoch,
      });
      expect(result.pendingCredentialRetirements).toBe(mqttServerId === 1 ? 0 : 1);
      expect(JSON.stringify(result) + JSON.stringify(scope.audit.mock.calls)).not.toContain('device-password-secret');
      expect(scope.revoke).not.toHaveBeenCalled();
      expect(scope.wago.refreshNetworkConnection).toHaveBeenCalledWith(1);
    },
  );
}
