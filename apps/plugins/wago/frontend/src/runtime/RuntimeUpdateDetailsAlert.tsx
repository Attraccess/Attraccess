import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import runtimeMessages from '../managed-runtime.en.json';
import type { RuntimeUpdateStatus } from '../api/client';
import { useWagoTranslations } from '../i18n';

export function RuntimeUpdateDetailsAlert({ status }: { status: RuntimeUpdateStatus }) {
  const { t } = useWagoTranslations();
  const alertStatus =
    status.management === 'managed' &&
    status.update?.phase === 'current' &&
    !status.blocker &&
    !status.runtimeUpdateRequired
      ? 'success'
      : 'warning';
  return (
    <Alert status={alertStatus}>
      <AlertStatusIcon status={alertStatus} />
      <Alert.Content>
        <Alert.Title>
          {status.management === 'managed'
            ? t('runtimeManagement.automatic')
            : status.management === 'verified'
              ? t('runtimeManagement.setupTitle')
              : status.management === 'retired'
                ? t('runtimeManagement.retired')
                : t('runtimeManagement.attention')}
        </Alert.Title>
        <Alert.Description>
          {status.management === 'retired'
            ? t('runtimeManagement.retiredDescription')
            : status.management !== 'managed'
              ? Object.hasOwn(runtimeMessages.stateDescriptions, status.management)
                ? t(`runtimeManagement.stateDescriptions.${status.management}`)
                : t('runtimeManagement.actionFailed')
              : t('runtimeManagement.automaticDescription')}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
