import { Form } from '@heroui/react';
import type { CommissioningSession } from '../../api/client';
import { useMqttServersQuery } from '../../api/queries';
import { BundledRuntime, type RuntimeArtifactInfo } from '../artifacts/BundledRuntime';
import type { CommissioningForm } from '../useCommissioningState';
import { ConnectionStep } from './ConnectionStep';
import { NameStep } from './NameStep';

interface ConnectionFieldsProps {
  session: CommissioningSession | null;
  activeStep: number;
  isLoading: boolean;
  form: CommissioningForm;
  onFormChange: (patch: Partial<CommissioningForm>) => void;
  onArtifactBusyChange: (busy: boolean) => void;
  onArtifactChange: (artifact: RuntimeArtifactInfo | null) => void;
  onStepChange: (step: number) => void;
  onCreate: () => void;
}

export function ConnectionFields({
  session,
  activeStep,
  isLoading,
  form,
  onFormChange,
  onArtifactBusyChange,
  onArtifactChange,
  onStepChange,
  onCreate,
}: ConnectionFieldsProps) {
  const mqttServersQuery = useMqttServersQuery();
  return (
    <Form
      id="wago-commissioning-connection"
      onSubmit={(event) => {
        event.preventDefault();
        if (activeStep === 0 && form.name.trim()) {
          onArtifactBusyChange(true);
          onStepChange(1);
        } else if (activeStep === 1 && !isLoading) onCreate();
      }}
    >
      {!session && activeStep === 0 && <NameStep name={form.name} onNameChange={(name) => onFormChange({ name })} />}
      {!session && activeStep === 1 && (
        <ConnectionStep
          controllerIp={form.controllerIp}
          mqttServerId={form.mqttServerId}
          mqttServersQuery={mqttServersQuery}
          selectedMqttServerId={form.mqttServerId === null ? null : Number(form.mqttServerId)}
          onControllerIpChange={(controllerIp) => onFormChange({ controllerIp })}
          onMqttServerIdChange={(mqttServerId) => onFormChange({ mqttServerId })}
        />
      )}
      {!session && activeStep === 1 && (
        <BundledRuntime
          compact
          disabled={isLoading}
          onBusyChange={onArtifactBusyChange}
          onSelectionChange={onArtifactChange}
        />
      )}
    </Form>
  );
}
