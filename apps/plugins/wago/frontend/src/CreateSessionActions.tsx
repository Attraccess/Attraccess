import { Button } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { CommissioningModel } from './CommissioningModal';

export function CreateSessionActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    activeStep,
    name,
    controllerIp,
    mqttServersQuery,
    artifactBusy,
    artifactAvailable,
    selectedMqttServerId,
    setStep,
  } = model;
  return (
    <>
      {!session && activeStep === 0 && (
        <Button isDisabled={!name.trim()} type="submit" form="wago-commissioning-connection">
          {t('commissioningUI.continue')}
        </Button>
      )}
      {!session && activeStep === 1 && (
        <>
          <Button variant="secondary" onPress={() => setStep(0)}>
            {t('commissioningUI.back')}
          </Button>
          <Button
            isPending={isLoading}
            type="submit"
            form="wago-commissioning-connection"
            isDisabled={
              artifactBusy ||
              !artifactAvailable ||
              !controllerIp.trim() ||
              selectedMqttServerId === null ||
              mqttServersQuery.isPending ||
              mqttServersQuery.isError
            }
          >
            {t(isLoading ? 'commissioningUI.preparing' : 'commissioningUI.continue')}
          </Button>
        </>
      )}
    </>
  );
}
