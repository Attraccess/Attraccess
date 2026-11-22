// Turns a setup failure into translated text. Only secret-free data (step,
// error kind, device message, last Wi-Fi status) ever reaches the message.
import { SetupStepError, ShellyBleError } from '../../bluetooth/errors';
import { JoinTimeoutError } from '../../bluetooth/provisioning';

type T = (key: string, data?: Record<string, string | number>) => string;

export function describeSetupError(err: unknown, t: T, options: { protectedDevice?: boolean } = {}): string {
  if (!(err instanceof SetupStepError)) return describeCause(err, t);
  const step = t(`ble.steps.${err.step === 'password' && options.protectedDevice ? 'passwordCheck' : err.step}`);
  const cause = err.cause;
  const title = t('ble.failure.title', { step });
  // Only a real timeout carries a Wi-Fi status; a lost link or a device error says what it is.
  if (err.step === 'join' && cause instanceof JoinTimeoutError)
    return `${title}. ${t('ble.failure.joinTimeout', { status: String(err.data.status ?? 'unknown') })}`;
  if (err.step === 'register') {
    // The server's message may or may not end in punctuation; the translation adds its own.
    const message = cause instanceof Error ? cause.message.trim().replace(/[.\s]+$/, '') : '';
    return `${title}. ${t(message ? 'ble.failure.registerFailed' : 'ble.failure.registerFailedNoDetail', { message })}`;
  }
  return `${title}. ${describeCause(cause, t)}`;
}

function describeCause(cause: unknown, t: T): string {
  if (cause instanceof ShellyBleError) {
    switch (cause.kind) {
      case 'wrongPassword':
      case 'authRequired':
        return t('ble.failure.wrongPassword');
      case 'linkLost':
        return t('ble.failure.linkLost');
      case 'timeout':
        return t('ble.failure.timeout');
      case 'rpc':
        return t('ble.failure.rpc', cause.data);
      default:
        return t('ble.failure.generic');
    }
  }
  return t('ble.failure.generic');
}

/** Message for a failure before the setup starts (chooser, connect, device info). */
export function describeConnectError(err: unknown, t: T): string {
  if (err instanceof ShellyBleError) {
    if (err.kind === 'noRpcService') return t('ble.connect.noRpcService');
    if (err.kind === 'linkLost' || err.kind === 'timeout') return t('ble.connect.linkLost');
  }
  return t('ble.connect.generic');
}
