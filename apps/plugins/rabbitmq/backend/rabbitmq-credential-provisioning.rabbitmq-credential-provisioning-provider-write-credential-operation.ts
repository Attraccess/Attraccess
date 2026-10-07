import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { ProvisionedMqttCredential } from '@attraccess/plugins-backend-sdk';
import { Mutex } from 'async-mutex';
import { RabbitmqCredentialProvisioningProviderRevokeOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-revoke-operation';
export abstract class RabbitmqCredentialProvisioningProviderWriteCredentialOperation extends RabbitmqCredentialProvisioningProviderRevokeOperation {
  protected async writeCredential(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    this.assertRequest(request);
    const config = await this.requireConfig(request.mqttServerId);
    this.assertNotManagementUser(config, request.username);
    const lockKey = `${config.id}:${request.vhost}`;
    let lock = RabbitmqCredentialProvisioningProviderWriteCredentialOperation.vhostLocks.get(lockKey);
    if (!lock) {
      lock = { mutex: new Mutex(), users: 0 };
      RabbitmqCredentialProvisioningProviderWriteCredentialOperation.vhostLocks.set(lockKey, lock);
    }
    lock.users += 1;

    try {
      return await lock.mutex.runExclusive(() => this.writeCredentialLocked(request, config));
    } finally {
      lock.users -= 1;
      if (
        lock.users === 0 &&
        RabbitmqCredentialProvisioningProviderWriteCredentialOperation.vhostLocks.get(lockKey) === lock
      ) {
        RabbitmqCredentialProvisioningProviderWriteCredentialOperation.vhostLocks.delete(lockKey);
      }
    }
  }
}
