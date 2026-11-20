import { StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { Input, Label, ListBox, Select, TextField, type Key } from '@heroui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MqttServer } from '../../api/client';
import { useWagoTranslations } from '../../i18n';

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
  mqttServersQuery: UseQueryResult<MqttServer[]>;
  selectedMqttServerId: number | null;
  onControllerIpChange: (value: string) => void;
  onMqttServerIdChange: (value: Key | null) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <StatusAlert status="accent" title={t('commissioningUI.prepare')}>
        {t('commissioningUI.prepareDescription')}
      </StatusAlert>
      <TextField isRequired name="controller-ip">
        <Label>{t('commissioningUI.ip')}</Label>
        <Input
          value={controllerIp}
          placeholder="192.168.1.42"
          onChange={(event) => onControllerIpChange(event.target.value)}
        />
      </TextField>
      {mqttServersQuery.isPending ? (
        <TableDataLoadingIndicator />
      ) : mqttServersQuery.isError ? (
        <StatusAlert status="danger">
          {mqttServersQuery.error instanceof Error ? mqttServersQuery.error.message : t('common.retry')}
        </StatusAlert>
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
