import { Form } from '@heroui/react';
import { BundledRuntime } from '../artifacts/BundledRuntime';
import type { CommissioningState } from '../useCommissioningState';
import { ConnectionStep } from './ConnectionStep';
import { NameStep } from './NameStep';

type ConnectionFieldsProps = Pick<
  CommissioningState,
  | 'session'
  | 'isLoading'
  | 'activeStep'
  | 'name'
  | 'setName'
  | 'controllerIp'
  | 'setControllerIp'
  | 'mqttServerId'
  | 'setMqttServerId'
  | 'selectedMqttServerId'
  | 'mqttServersQuery'
  | 'setArtifactBusy'
  | 'setSelectedArtifact'
  | 'setStep'
  | 'createSession'
>;

export function ConnectionFields({
  session,
  isLoading,
  activeStep,
  name,
  setName,
  controllerIp,
  setControllerIp,
  mqttServerId,
  setMqttServerId,
  selectedMqttServerId,
  mqttServersQuery,
  setArtifactBusy,
  setSelectedArtifact,
  setStep,
  createSession,
}: ConnectionFieldsProps) {
  return (
    <Form
      id="wago-commissioning-connection"
      onSubmit={(event) => {
        event.preventDefault();
        if (activeStep === 0 && name.trim()) {
          setArtifactBusy(true);
          setStep(1);
        } else if (activeStep === 1 && !isLoading) createSession();
      }}
    >
      {!session && activeStep === 0 && <NameStep name={name} onNameChange={setName} />}
      {!session && activeStep === 1 && (
        <ConnectionStep
          controllerIp={controllerIp}
          mqttServerId={mqttServerId}
          mqttServersQuery={mqttServersQuery}
          selectedMqttServerId={selectedMqttServerId}
          onControllerIpChange={setControllerIp}
          onMqttServerIdChange={setMqttServerId}
        />
      )}
      {!session && activeStep === 1 && (
        <BundledRuntime
          compact
          disabled={isLoading}
          onBusyChange={setArtifactBusy}
          onSelectionChange={setSelectedArtifact}
        />
      )}
    </Form>
  );
}
