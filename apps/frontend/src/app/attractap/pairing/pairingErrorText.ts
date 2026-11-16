import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PairingError } from './pairingUtils';

const ERROR_TEXT: Record<string, (t: TFunction, error: PairingError) => string> = {
  rateLimited: (t, error) =>
    error.retryAfterSeconds === undefined
      ? t('dialog.error.rateLimited')
      : t('dialog.error.rateLimitedRetry', { seconds: error.retryAfterSeconds }),
  unknown: (t, error) => (error.message ? `${t('dialog.error.unknown')}: ${error.message}` : t('dialog.error.unknown')),
};

export function errorText(t: TFunction, error: PairingError) {
  return (ERROR_TEXT[error.kind] ?? ((tt: TFunction) => tt(`dialog.error.${error.kind}`)))(t, error);
}
