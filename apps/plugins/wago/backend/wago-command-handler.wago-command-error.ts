


export class WagoCommandError extends Error {
  constructor(
    message: string,
    readonly kind: 'transport-dispatch' | 'acknowledgement-timeout' | 'controller-rejection',
  ) {
    super(message);
    this.name = 'WagoCommandError';
  }
}
