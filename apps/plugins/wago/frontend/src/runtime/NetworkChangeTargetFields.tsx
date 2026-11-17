import { Description, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import type { MqttServer } from '../api/client';
import { useWagoTranslations } from '../i18n';

interface NetworkChangeTargetFieldsProps {
  targetHost: string;
  onTargetHostChange: (value: string) => void;
  server: string | null;
  onServerChange: (value: string | null) => void;
  servers: MqttServer[] | undefined;
  serversError: boolean;
  isDisabled: boolean;
}

export function NetworkChangeTargetFields({
  targetHost,
  onTargetHostChange,
  server,
  onServerChange,
  servers,
  serversError,
  isDisabled,
}: NetworkChangeTargetFieldsProps) {
  const { t } = useWagoTranslations();
  const selectedServer = servers?.find((item) => String(item.id) === server);
  return (
    <>
      <TextField value={targetHost} onChange={onTargetHostChange} isDisabled={isDisabled}>
        <Label>{t('networkChange.address')}</Label>
        <Input autoComplete="off" placeholder="192.168.1.10" />
        <Description>{t('networkChange.addressDescription')}</Description>
      </TextField>
      <Select
        value={server}
        onChange={(value) => onServerChange(value === null ? null : String(value))}
        isDisabled={isDisabled}
      >
        <Label>{t('networkChange.server')}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="address" textValue={t('networkChange.addressOnly')}>
              {t('networkChange.addressOnly')}
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {(servers ?? []).map((item) => (
              <ListBox.Item key={item.id} id={String(item.id)} textValue={item.name}>
                {item.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <Description>{t('networkChange.refreshDescription')}</Description>
      </Select>
      {selectedServer && (
        <p>
          {selectedServer.host}:{selectedServer.port}
        </p>
      )}
      {serversError && <p role="alert">{t('networkChange.serversUnavailable')}</p>}
    </>
  );
}
