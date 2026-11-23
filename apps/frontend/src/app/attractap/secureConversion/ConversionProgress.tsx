import { ProgressBar, ProgressBarFill, ProgressBarTrack } from '@heroui/react';
import { Button, ConfirmableButton, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useCancelSecureConversion,
  useRetrySecureConversion,
  type SecureConversionStatusDto,
} from '@attraccess/react-query-client';
import { conversionErrorText } from './conversionErrorText';
import { ConversionStateChip } from './ConversionStateChip';
import { isCritical } from './conversionStates';
import de from './de.json';
import en from './en.json';

interface Props {
  readerId: number;
  status: SecureConversionStatusDto;
  /** Called after a cancel or retry was accepted, so the caller refreshes at once. */
  onChanged: () => void;
}

/** Live view of the reader's latest conversion: step, transfer, "Don't unplug", failure with retry, cancel. */
export function ConversionProgress({ readerId, status, onChanged }: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const cancel = useCancelSecureConversion(undefined, { onSuccess: onChanged });
  const retry = useRetrySecureConversion(undefined, { onSuccess: onChanged });
  const conversion = status.conversion;
  if (!conversion || (conversion.state as string) === 'cancelled') return null;

  const state = conversion.state as string;
  const percent = conversion.bytesTotal > 0 ? Math.round((conversion.bytesDone / conversion.bytesTotal) * 100) : 0;
  const error = cancel.error ?? retry.error;

  return (
    <div className="flex flex-col gap-3" data-cy="secure-conversion-progress">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{t('progress.step')}</span>
        <ConversionStateChip state={conversion.state} />
      </div>

      {isCritical(conversion.state) && (
        <StatusAlert status="warning" title={t('progress.dontUnplug')} data-cy="secure-conversion-dont-unplug">
          {t('progress.dontUnplugHint')}
        </StatusAlert>
      )}

      {state === 'transferring' && (
        <ProgressBar value={percent} aria-label={t('progress.transfer')} data-cy="secure-conversion-transfer">
          <div className="flex justify-between text-sm">
            <span>{t('progress.transfer')}</span>
            <span>{percent} %</span>
          </div>
          <ProgressBarTrack>
            <ProgressBarFill />
          </ProgressBarTrack>
        </ProgressBar>
      )}

      {!status.online && state !== 'secured' && state !== 'failed' && (
        <p className="text-sm text-muted" data-cy="secure-conversion-offline">
          {t('progress.offline')}
        </p>
      )}

      {state === 'secured' && (
        <StatusAlert status="success" data-cy="secure-conversion-secured">
          {t('progress.secured')}
        </StatusAlert>
      )}

      {state === 'failed' && (
        <StatusAlert status="danger" title={t('failure.title')} data-cy="secure-conversion-failed">
          {t(`failure.${conversion.failureReason ?? 'protocol-error'}`)}
        </StatusAlert>
      )}

      {state === 'interrupted' && (
        <StatusAlert status="danger" title={t('interrupted.title')} data-cy="secure-conversion-interrupted">
          {t('interrupted.message')}
        </StatusAlert>
      )}

      {error ? <StatusAlert status="danger">{conversionErrorText(error, t)}</StatusAlert> : null}

      <div className="flex justify-end gap-2">
        {status.canRetry && (
          <Button
            variant="secondary"
            isPending={retry.isPending}
            onPress={() => retry.mutate({ path: { id: readerId } })}
            data-cy="secure-conversion-retry"
          >
            {t('progress.retry')}
          </Button>
        )}
        {status.canCancel && (
          <ConfirmableButton
            label={t('progress.cancel')}
            status="warning"
            data-cy="secure-conversion-cancel"
            confirm={{
              title: t('progress.cancelTitle'),
              message: t('progress.cancelMessage'),
              confirmLabel: t('progress.cancel'),
              cancelLabel: t('progress.keep'),
              confirmDataCy: 'secure-conversion-cancel-confirm',
            }}
            isPending={cancel.isPending}
            onConfirm={() => cancel.mutateAsync({ path: { id: readerId } })}
          />
        )}
      </div>
    </div>
  );
}
