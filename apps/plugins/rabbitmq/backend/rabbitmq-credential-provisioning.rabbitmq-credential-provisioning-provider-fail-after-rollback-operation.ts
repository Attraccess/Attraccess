import { RabbitmqCredentialProvisioningProviderRestorePermissionOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-restore-permission-operation';

export abstract class RabbitmqCredentialProvisioningProviderFailAfterRollbackOperation extends RabbitmqCredentialProvisioningProviderRestorePermissionOperation {
  protected async failAfterRollback(error: unknown, rollback: Array<() => Promise<unknown>>): Promise<never> {
    const results = await Promise.allSettled(rollback.map((operation) => operation()));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError([error, ...failures], 'Credential provisioning failed and rollback was incomplete.');
    }
    throw error;
  }
}
