// Turns a setup failure into translated text. Only secret-free data (step,
// error kind, device message, last Wi-Fi status) ever reaches the message.
import { SetupStepError, ShellyBleError } from '../../bluetooth/errors';

type T = (key: string, data?: Record<string, string | number>) => string;

export function describeSetupError(err: unknown, t: T): string {
  if (!(err instanceof SetupStepError)) return describeCause(err, t);
  const step = t(`ble.steps.${err.step}`);
  const cause = err.cause;
  const title = t('ble.failure.title', { step });
  if (err.step === 'join')
    return `${title}. ${t('ble.failure.joinTimeout', { status: String(err.data.status ?? 'unknown') })}`;
  if (err.step === 'register') {
    const message = cause instanceof Error ? cause.message : '';
    return `${title}. ${t('ble.failure.registerFailed', { message })}`;
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
