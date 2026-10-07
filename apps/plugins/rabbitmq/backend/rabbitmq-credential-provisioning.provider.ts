import type { MqttCredentialProvisioningProvider, PluginContext } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderAssertNotManagementUserOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-assert-not-management-user-operation';

export class RabbitmqCredentialProvisioningProvider
  extends RabbitmqCredentialProvisioningProviderAssertNotManagementUserOperation
  implements MqttCredentialProvisioningProvider
{
  constructor(context: PluginContext) {
    super(context);
  }
}

// RabbitMQ topic permissions evaluate AMQP routing keys, where rabbitmq_mqtt
// maps MQTT's / topic levels to dots. Escape literal segments and translate
// MQTT's + and # wildcards without widening a level boundary.
export { mqttFiltersToRegex } from './rabbitmq-credential-provisioning.helpers';
