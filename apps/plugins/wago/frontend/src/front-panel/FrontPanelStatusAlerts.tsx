import { Alert } from '@heroui/react';
import { ConfigurationErrors } from '../configuration/ConfigurationChanges';
import type { useFrontPanelState } from './useFrontPanelState';
export function FrontPanelStatusAlerts({ model }: { model: ReturnType<typeof useFrontPanelState> }) {
  return (
    <>
      {model.panel.loadError && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{model.t('panel.loadError')}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {(model.panel.errorKey || model.panel.backendError) && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>
              {model.panel.errorKey ? model.t(model.panel.errorKey) : model.t('panel.applyError')}
            </Alert.Title>
            {model.panel.backendError && (
              <Alert.Description className="wg:whitespace-pre-wrap wg:break-words">
                {model.tBackendMessage(model.panel.backendError)}
              </Alert.Description>
            )}
            {model.panel.validationErrors.length > 0 && model.panel.configuration && (
              <ConfigurationErrors
                errors={model.panel.validationErrors}
                snapshot={model.panel.configuration.snapshot}
                names={model.panel.configuration.metadata.names}
              />
            )}
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}
