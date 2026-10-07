import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { RabbitmqDetectionService } from './rabbitmq-detection.service';
import { RabbitmqManagementClient } from './rabbitmq-management-client';
import { VhostLock } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqCredentialProvisioningProviderSupportsContract } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-supports-contract';

export abstract class RabbitmqCredentialProvisioningProviderState extends RabbitmqCredentialProvisioningProviderSupportsContract {
  protected static readonly vhostLocks = new Map<string, VhostLock>();

  readonly id = 'rabbitmq';

  readonly displayName = 'RabbitMQ Management API';

  protected readonly client = new RabbitmqManagementClient();

  protected readonly detection: RabbitmqDetectionService;

  constructor(protected readonly context: PluginContext) {
    super();
    this.detection = new RabbitmqDetectionService(context);
  }
}
