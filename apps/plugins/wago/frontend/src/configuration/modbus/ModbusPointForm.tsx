import { Description, Label, ListBox, Select } from '@heroui/react';
import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { Choice } from './Choice';
import { modbusDisplayName } from './modbus-labels';

/** Host editor sets hardwareProfile=modbus and channel=0; binding uses names, not channel offsets. */
export function ModbusPointForm({
  configuration,
  value,
  onChange,
  isDisabled = false,
}: {
  configuration: ModbusConfiguration;
  value: ModbusPoint;
  onChange: (value: ModbusPoint) => void;
  isDisabled?: boolean;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const device = configuration.devices.find((d) => d.id === value.deviceId);
  const profile = device && findProfile(configuration, device);
  return (
    <div className="wg:flex wg:flex-col wg:gap-3">
      <Choice
        label={t('modbus.device')}
        value={value.deviceId}
        options={configuration.devices.map((d) => d.id)}
        labels={Object.fromEntries(configuration.devices.map((d) => [d.id, d.name]))}
        disabled={isDisabled}
        onChange={(deviceId) => onChange({ deviceId })}
      />
      <Select
        isDisabled={isDisabled}
        value={value.measurementId ?? ''}
        onChange={(key) => onChange({ ...value, measurementId: key ? String(key) : undefined })}
      >
        <Label>{t('modbus.measurement')}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={t('modbus.none')}>
              {t('modbus.none')}
            </ListBox.Item>
            {profile?.measurements.map((m) => (
              <ListBox.Item id={m.id} key={m.id} textValue={modbusDisplayName(profile, m.name, tBackendMessage)}>
                {modbusDisplayName(profile, m.name, tBackendMessage)} ({m.unit})
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        isDisabled={isDisabled}
        value={value.actionId ?? ''}
        onChange={(key) => onChange({ ...value, actionId: key ? String(key) : undefined })}
      >
        <Label>{t('modbus.action')}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={t('modbus.none')}>
              {t('modbus.none')}
            </ListBox.Item>
            {profile?.actions.map((a) => (
              <ListBox.Item id={a.id} key={a.id} textValue={modbusDisplayName(profile, a.name, tBackendMessage)}>
                {modbusDisplayName(profile, a.name, tBackendMessage)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Description>{t('modbus.scalingHint')}</Description>
    </div>
  );
}
