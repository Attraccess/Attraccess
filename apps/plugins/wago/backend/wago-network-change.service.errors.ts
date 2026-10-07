export class NetworkChangeError extends Error {
  constructor(
    readonly failure: 'broker_configuration' | 'broker_provisioning' | 'broker_verification' | 'host_connection',
  ) {
    super(failure);
  }
}
