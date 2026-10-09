export class SerialAdmissionRejected extends Error {
  constructor(readonly reason: unknown) {
    super('RTU admission rejected before transmission');
  }
}
export class ModbusTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
