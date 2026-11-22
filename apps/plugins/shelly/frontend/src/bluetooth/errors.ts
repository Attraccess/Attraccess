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

/** The device answered an RPC call with an error object. */
export class RpcError extends ShellyBleError {
  constructor(
    public readonly method: string,
    public readonly code: number | undefined,
    public readonly deviceMessage: string,
  ) {
    super('rpc', `${method} failed: ${deviceMessage} (code ${code ?? '?'})`, {
      method,
      code: code ?? 0,
      message: deviceMessage,
    });
    this.name = 'RpcError';
  }
}

export type SetupStep = 'password' | 'wifi' | 'join' | 'register' | 'bluetooth';

/** A setup step failed; `cause` is the underlying (secret-free) error. */
export class SetupStepError extends Error {
  constructor(
    public readonly step: SetupStep,
    public readonly cause: unknown,
    /** Extra non-secret detail, e.g. the last Wi-Fi status of a join timeout. */
    public readonly data: Record<string, string | number> = {},
  ) {
    super(`Setup step "${step}" failed`);
    this.name = 'SetupStepError';
  }
}
