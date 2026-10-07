import { Alert, Input, Label, ListBox, Select, Spinner, TextField } from '@heroui/react';
import { Key } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { useMqttServersQuery } from './queries';
import { ErrorAlert } from './CommissioningModal.error-alert';

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
