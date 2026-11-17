import { AlertStatusIcon, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import { ConfigurationErrors } from '../../configuration/ConfigurationChanges';
import { useWagoTranslations } from '../../i18n';
import type { FrontPanelWorkingCopy } from './useFrontPanel';

interface FrontPanelStatusAlertsProps {
  panel: Pick<FrontPanelWorkingCopy, 'loadError' | 'errorKey' | 'backendError' | 'validationErrors' | 'configuration'>;
}

export function FrontPanelStatusAlerts({ panel }: FrontPanelStatusAlertsProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <>
      {panel.loadError && <StatusAlert status="danger" title={t('panel.loadError')} />}
      {(panel.errorKey || panel.backendError) && (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <Alert.Content>
            <Alert.Title>{panel.errorKey ? t(panel.errorKey) : t('panel.applyError')}</Alert.Title>
            {panel.backendError && (
              <Alert.Description className="wg:whitespace-pre-wrap wg:break-words">
                {tBackendMessage(panel.backendError)}
              </Alert.Description>
            )}
            {panel.validationErrors.length > 0 && panel.configuration && (
              <ConfigurationErrors
                errors={panel.validationErrors}
                snapshot={panel.configuration.snapshot}
                names={panel.configuration.metadata.names}
              />
            )}
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}
