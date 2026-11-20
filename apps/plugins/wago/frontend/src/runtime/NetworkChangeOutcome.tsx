import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { NetworkChangeStatus } from '../api/client';
import { useWagoTranslations } from '../i18n';
import messages from '../network-change.en.json';

interface NetworkChangeOutcomeProps {
  operation: NetworkChangeStatus['operation'];
  actionFailed: boolean;
}

/** Failure, action error or success message of the current network change. */
export function NetworkChangeOutcome({ operation, actionFailed }: NetworkChangeOutcomeProps) {
  const { t } = useWagoTranslations();
  const failure = operation?.failure;
  return (
    <>
      {failure && (
        <StatusAlert status="danger" title={t('networkChange.failed')}>
          {t(`networkChange.failures.${Object.hasOwn(messages.failures, failure) ? failure : 'unknown'}`)}
        </StatusAlert>
      )}
      {actionFailed && !failure && <p role="alert">{t('networkChange.actionFailed')}</p>}
      {operation?.phase === 'completed' && (
        <StatusAlert
          status="success"
          title={t(operation.mqttServerId === null ? 'networkChange.addressSuccess' : 'networkChange.success')}
        />
      )}
    </>
  );
}
