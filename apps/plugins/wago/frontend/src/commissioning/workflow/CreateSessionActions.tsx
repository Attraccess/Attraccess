import { Button } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useMqttServersQuery } from '../../api/queries';
import { useWagoTranslations } from '../../i18n';
import type { CommissioningForm } from '../useCommissioningState';

interface CreateSessionActionsProps {
  session: CommissioningSession | null;
  activeStep: number;
  isLoading: boolean;
  form: CommissioningForm;
  artifactReady: boolean;
  onStepChange: (step: number) => void;
}

export function CreateSessionActions({
  session,
  activeStep,
  isLoading,
  form,
  artifactReady,
  onStepChange,
}: CreateSessionActionsProps) {
  const { t } = useWagoTranslations();
  const mqttServersQuery = useMqttServersQuery();
  if (session) return null;
  return (
    <>
      {activeStep === 0 && (
        <Button isDisabled={!form.name.trim()} type="submit" form="wago-commissioning-connection">
          {t('commissioningUI.continue')}
        </Button>
      )}
      {activeStep === 1 && (
        <>
          <Button variant="secondary" onPress={() => onStepChange(0)}>
            {t('commissioningUI.back')}
          </Button>
          <Button
            isPending={isLoading}
            type="submit"
            form="wago-commissioning-connection"
            isDisabled={
              !artifactReady ||
              !form.controllerIp.trim() ||
              form.mqttServerId === null ||
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
