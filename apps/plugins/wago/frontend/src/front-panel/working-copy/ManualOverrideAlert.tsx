import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';
import type { FrontPanelWorkingCopy } from './useFrontPanel';

interface ManualOverrideAlertProps {
  manualCount: number;
  panel: Pick<FrontPanelWorkingCopy, 'busy' | 'live' | 'release'>;
}

/** Manual overrides that stay active until released. */
export function ManualOverrideAlert({ manualCount, panel }: ManualOverrideAlertProps) {
  const { t } = useWagoTranslations();
  if (manualCount <= 0) return null;
  return (
    <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{t('panel.manualActive', { count: manualCount })}</Alert.Title>
        <Alert.Description>{t('panel.manualHint')}</Alert.Description>
      </Alert.Content>
      <Button variant="secondary" isDisabled={panel.busy || !panel.live.enabled} onPress={panel.release}>
        {t('panel.release')}
      </Button>
    </Alert>
  );
}
