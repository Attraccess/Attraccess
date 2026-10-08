import { Alert } from '@heroui/react';
import runtimeMessages from '../managed-runtime.en.json';
import { useRuntimeUpdateDetailsState } from './useRuntimeUpdateDetailsState';
type Props = Pick<ReturnType<typeof useRuntimeUpdateDetailsState>, 'status' | 't'>;
export function RuntimeUpdateDetailsAlert({ status, t }: Props) {
  return (
    <Alert
      status={
        status.management === 'managed' &&
        status.update?.phase === 'current' &&
        !status.blocker &&
        !status.runtimeUpdateRequired
          ? 'success'
          : 'warning'
      }
    >
      <Alert.Indicator />
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
