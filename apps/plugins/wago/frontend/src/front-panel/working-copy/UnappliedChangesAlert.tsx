import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';
import type { FrontPanelWorkingCopy } from './useFrontPanel';

interface UnappliedChangesAlertProps {
  panel: Pick<FrontPanelWorkingCopy, 'ready' | 'dirty' | 'busy' | 'pending' | 'conflict' | 'discard' | 'apply'>;
}

/** Shown while the working copy differs from the controller's applied configuration. */
export function UnappliedChangesAlert({ panel }: UnappliedChangesAlertProps) {
  const { t } = useWagoTranslations();
  if (!panel.ready || !panel.dirty) return null;
  return (
    <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{t('panel.unapplied')}</Alert.Title>
        <Alert.Description>{t('panel.unappliedHint')}</Alert.Description>
      </Alert.Content>
      <div className="wg:flex wg:flex-wrap wg:gap-2">
        <Button variant="secondary" isDisabled={panel.busy || panel.pending} onPress={() => void panel.discard()}>
          {t('panel.discard')}
        </Button>
        <Button isDisabled={panel.busy || panel.pending || panel.conflict} isPending={panel.busy} onPress={panel.apply}>
          {t('panel.apply')}
        </Button>
      </div>
    </Alert>
  );
}
