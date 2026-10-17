import { Form } from '@heroui/react';
import { BundledRuntime } from '../artifacts/BundledRuntime';
import { NameStep } from './Steps';
import { ConnectionStep } from './Steps';
import { CommissioningModel } from '../CommissioningModal';

export function ConnectionFields({ model }: { model: CommissioningModel }) {
  const {
    session,
    isLoading,
    activeStep,
    name,
    setName,
    controllerIp,
    setControllerIp,
    mqttServerId,
    setMqttServerId,
    mqttServersQuery,
    setArtifactBusy,
    setSelectedArtifact,
  } = model;
  return (
    <Form
      id="wago-commissioning-connection"
      onSubmit={(event) => {
        event.preventDefault();
        if (activeStep === 0 && name.trim()) {
          setArtifactBusy(true);
          model.setStep(1);
        } else if (activeStep === 1 && !isLoading) model.createSession();
      }}
    >
      {!session && activeStep === 0 && <NameStep name={name} onNameChange={setName} />}
      {!session && activeStep === 1 && (
        <ConnectionStep
          controllerIp={controllerIp}
          mqttServerId={mqttServerId}
          mqttServersQuery={mqttServersQuery}
          selectedMqttServerId={model.selectedMqttServerId}
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
