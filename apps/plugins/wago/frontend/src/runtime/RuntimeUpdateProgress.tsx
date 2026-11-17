import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { RuntimeUpdateStatus } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { useRuntimeFailureMessages } from './useRuntimeFailureMessages';

/** The desired image, last failure, storage shortfall and cleanup schedule of a runtime update. */
export function RuntimeUpdateProgress({ update }: { update: NonNullable<RuntimeUpdateStatus['update']> }) {
  const { t, language } = useWagoTranslations();
  const { failureMessage } = useRuntimeFailureMessages();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const mebibytes = (kibibytes: number) => (kibibytes / 1024).toLocaleString(language, { maximumFractionDigits: 1 });
  return (
    <>
      <p>
        {t('runtimeManagement.desired')} <code className="wg:break-all">{update.desiredImageId}</code>
      </p>
      {update.failure && (
        <p role="status">
          {t('runtimeManagement.failure', {
            failure: failureMessage(update.failure),
          })}{' '}
          {update.retryAt > 0 &&
            t('runtimeManagement.retryAfter', {
              date: formatDateTime(update.retryAt),
            })}
        </p>
      )}
      {!!update.storageDiagnostics?.length && (
        <StatusAlert status="warning" title={t('runtimeManagement.storageTitle')}>
          {update.storageDiagnostics.map((diagnostic) => (
            <p key={diagnostic.path}>
              {t('runtimeManagement.storageShortfall', {
                path: diagnostic.path,
                required: mebibytes(diagnostic.requiredKiB),
                available: mebibytes(diagnostic.availableKiB),
                shortfall: mebibytes(diagnostic.requiredKiB - diagnostic.availableKiB),
              })}
            </p>
          ))}
          <p>{t('runtimeManagement.storageAction')}</p>
          <p>
            {t(
              update.phase === 'failed'
                ? 'runtimeManagement.previousRuntimeRunning'
                : 'runtimeManagement.recoveryPending',
            )}
          </p>
        </StatusAlert>
      )}
      {!!update.cleanupRetryAt && (
        <p role="status">
          {t('runtimeManagement.cleanup', {
            date: formatDateTime(update.cleanupRetryAt),
          })}
        </p>
      )}
    </>
  );
}
