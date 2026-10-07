import { Form } from '@heroui/react';
import { BundledRuntime } from './BundledRuntime';
import { NameStep } from './CommissioningModal.error-alert.helpers';
import type { CommissioningModel } from './CommissioningModal.contracts';
import { Alert } from '@heroui/react';
import { Input } from '@heroui/react';
import { Label } from '@heroui/react';
import { ListBox } from '@heroui/react';
import { Select } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { TextField } from '@heroui/react';
import type { Key } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { useMqttServersQuery } from './queries';
import { ErrorAlert } from './CommissioningModal.error-alert.helpers';

export function ConnectionStep({
  controllerIp,
  mqttServerId,
  mqttServersQuery,
  selectedMqttServerId,
  onControllerIpChange,
  onMqttServerIdChange,
}: {
  controllerIp: string;
  mqttServerId: Key | null;
  mqttServersQuery: ReturnType<typeof useMqttServersQuery>;
  selectedMqttServerId: number | null;
  onControllerIpChange: (value: string) => void;
  onMqttServerIdChange: (value: Key | null) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.prepare')}</Alert.Title>
          <Alert.Description>{t('commissioningUI.prepareDescription')}</Alert.Description>
        </Alert.Content>
      </Alert>
      <TextField isRequired name="controller-ip">
        <Label>{t('commissioningUI.ip')}</Label>
        <Input
          value={controllerIp}
          placeholder="192.168.1.42"
          onChange={(event) => onControllerIpChange(event.target.value)}
        />
      </TextField>
      {mqttServersQuery.isPending ? (
        <div className="wg:flex wg:justify-center wg:p-2">
          <Spinner color="accent" size="sm" />
        </div>
      ) : mqttServersQuery.isError ? (
        <ErrorAlert error={mqttServersQuery.error} />
      ) : (mqttServersQuery.data?.length ?? 0) > 1 ? (
        <Select
          className="wg:w-full"
          name="mqttServerId"
          placeholder={t('settings.select')}
          value={mqttServerId}
          onChange={onMqttServerIdChange}
        >
          <Label>{t('commissioningUI.mqtt')}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              renderEmptyState={() => (
                <span className="wg:block wg:p-3 wg:text-sm wg:text-muted">{t('settings.empty')}</span>
              )}
            >
              {(mqttServersQuery.data ?? []).map((server) => (
                <ListBox.Item key={server.id} id={server.id.toString()} textValue={server.name}>
                  <div className="wg:min-w-0 wg:truncate">{server.name}</div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : !selectedMqttServerId ? (
        <p role="alert">{t('settings.empty')}</p>
      ) : null}
    </div>
  );
}

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
