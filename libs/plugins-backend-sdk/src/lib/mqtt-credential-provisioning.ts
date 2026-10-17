import type { PluginContext } from './plugin-context';
import { MqttCredentialProvisioningProvider } from './persistence/plugin-context';

/** Factory keeps provider dependencies private to the plugin that owns them. */
export type MqttCredentialProvisioningProviderFactory = (context: PluginContext) => MqttCredentialProvisioningProvider;

export {
  MqttTopicPolicy,
  MqttCredentialRequest,
  ProvisionedMqttCredential,
  MqttCredentialProvisioningProvider,
  MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER,
  MqttCredentialProvisioningHostProvider,
  ManualMqttCredentialInstructions,
} from './persistence/plugin-context';
