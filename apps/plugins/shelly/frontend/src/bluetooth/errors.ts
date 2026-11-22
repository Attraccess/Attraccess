// Typed failures of the Bluetooth setup. The UI turns `kind` into a translated
// message, so nothing here carries request params: a Wi-Fi or admin password
// can never end up in an error text.

export type BleErrorKind =
  | 'unsupported'
  | 'noRpcService'
  | 'linkLost'
  | 'timeout'
  | 'malformedResponse'
  | 'responseTooLarge'
  | 'rpc'
  | 'authRequired'
  | 'wrongPassword';

export class ShellyBleError extends Error {
  constructor(
    public readonly kind: BleErrorKind,
    message: string,
    /** Safe, non-secret detail for the translated message (method, code, device message). */
    public readonly data: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = 'ShellyBleError';
  }
}

/** Device messages are shown to the operator; a misbehaving device could send anything. */
const MAX_DEVICE_MESSAGE = 200;

function clip(message: string): string {
  return message.length > MAX_DEVICE_MESSAGE ? `${message.slice(0, MAX_DEVICE_MESSAGE)}…` : message;
}

/** The device answered an RPC call with an error object. */
export class RpcError extends ShellyBleError {
  public readonly deviceMessage: string;

  constructor(
    public readonly method: string,
    public readonly code: number | undefined,
    deviceMessage: string,
  ) {
    super('rpc', `${method} failed: ${clip(deviceMessage)} (code ${code ?? '?'})`, {
      method,
      code: code ?? 0,
      message: clip(deviceMessage),
    });
    this.name = 'RpcError';
    this.deviceMessage = clip(deviceMessage);
  }
}

export type SetupStep = 'password' | 'wifi' | 'join' | 'register' | 'bluetooth';

/** The device did not report an IP address in time; `lastStatus` is its last Wi-Fi status. */
export class JoinTimeoutError extends Error {
  constructor(public readonly lastStatus: string) {
    super(`The device did not get an IP address (last status: ${lastStatus})`);
    this.name = 'JoinTimeoutError';
  }
}

/** A setup step failed; `cause` is the underlying (secret-free) error. */
export class SetupStepError extends Error {
  constructor(
    public readonly step: SetupStep,
    public readonly cause: unknown,
  ) {
    super(`Setup step "${step}" failed`);
    this.name = 'SetupStepError';
  }
}
