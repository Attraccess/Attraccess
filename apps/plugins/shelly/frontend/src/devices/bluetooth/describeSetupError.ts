// Turns a setup failure into translated text. Only secret-free data (step,
// error kind, device message, last Wi-Fi status) ever reaches the message.
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { JoinTimeoutError, SetupStepError, ShellyBleError } from '../../bluetooth/errors';
import { isAdapterUnavailable } from '../../bluetooth/webBluetooth';

/** A failed run: a short title naming the step, and what went wrong. */
export interface SetupFailure {
  title: string;
  detail: string;
}

export function describeSetupError(
  err: unknown,
  t: TFunction,
  options: { protectedDevice?: boolean } = {},
): SetupFailure {
  if (!(err instanceof SetupStepError)) return { title: t('ble.failure.titleGeneric'), detail: describeCause(err, t) };
  const step = t(`ble.steps.${err.step === 'password' && options.protectedDevice ? 'passwordCheck' : err.step}`);
  const title = t('ble.failure.title', { step });
  const cause = err.cause;
  // Only a real timeout carries a Wi-Fi status; a lost link or a device error says what it is.
  if (cause instanceof JoinTimeoutError)
    return { title, detail: t('ble.failure.joinTimeout', { status: cause.lastStatus }) };
  if (err.step === 'register') {
    // The server's message may or may not end in punctuation; the translation adds its own.
    const message = cause instanceof Error ? cause.message.trim().replace(/[.\s]+$/, '') : '';
    return {
      title,
      detail: t(message ? 'ble.failure.registerFailed' : 'ble.failure.registerFailedNoDetail', { message }),
    };
  }
  return { title, detail: describeCause(cause, t) };
}

function describeCause(cause: unknown, t: TFunction): string {
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
export function describeConnectError(err: unknown, t: TFunction): string {
  if (isAdapterUnavailable(err)) return t('ble.connect.adapterOff');
  if (err instanceof ShellyBleError) {
    if (err.kind === 'noRpcService') return t('ble.connect.noRpcService');
    if (err.kind === 'linkLost' || err.kind === 'timeout') return t('ble.connect.linkLost');
  }
  return t('ble.connect.generic');
}
