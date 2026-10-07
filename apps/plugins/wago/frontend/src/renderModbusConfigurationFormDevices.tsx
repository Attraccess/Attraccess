import { Button, Label, ListBox, Select } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import { Field } from './ModbusConfigurationForm.choice.helpers';
import { Choice } from './ModbusConfigurationForm.choice.helpers';
import { useModbusConfigurationFormState } from './useModbusConfigurationFormState';
type Model = ReturnType<typeof useModbusConfigurationFormState>;
type Props = Pick<
  Model,
  | 'focused'
  | 'section'
  | 'selectedId'
  | 'change'
  | 'value'
  | 't'
  | 'showIdentifiers'
  | 'isDisabled'
  | 'profiles'
  | 'tBackendMessage'
  | 'deviceChannels'
>;
export function renderModbusConfigurationFormDevices(
  d: NonNullable<Model['value']>['devices'][number],
  index: number,
  {
    focused,
    section,
    selectedId,
    change,
    value,
    t,
    showIdentifiers,
    isDisabled,
    profiles,
    tBackendMessage,
    deviceChannels,
  }: Props,
) {
  if (focused && (section !== 'devices' || d.id !== selectedId)) return null;
  const update = (patch: Partial<typeof d>) =>
    change({ ...value, devices: value.devices.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <section key={index} className="wg:flex wg:flex-col wg:gap-3">
      <h3>{t('modbus.deviceTitle', { name: d.name })}</h3>
      <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
        {showIdentifiers && (
          <Field label={t('modbus.deviceId')} value={d.id} disabled={isDisabled} onChange={(id) => update({ id })} />
        )}
        <Field
          label={t('modbus.deviceName')}
          value={d.name}
          disabled={isDisabled}
          onChange={(name) => update({ name })}
        />
        <Choice
          label={t('modbus.connection')}
          value={d.connectionId}
          options={value.connections.map((c) => c.id)}
          labels={Object.fromEntries(
            value.connections.map((c, i) => [
              c.id,
              t('modbus.connectionTitle', {
                index: i + 1,
                address: c.transport === 'tcp' ? c.host || 'TCP' : c.path,
              }),
            ]),
          )}
          disabled={isDisabled}
          onChange={(connectionId) => update({ connectionId })}
        />
        <Field
          label={t('modbus.unitId')}
          value={d.unitId}
          numeric
          disabled={isDisabled}
          onChange={(v) => update({ unitId: Number(v) })}
        />
        <Select
          isDisabled={isDisabled}
          value={`${d.profileId}@${d.profileVersion}`}
          onChange={(key) => {
            const p = profiles.find((p) => `${p.id}@${p.version}` === key);
            if (p) update({ profileId: p.id, profileVersion: p.version });
          }}
        >
          <Label>{t('modbus.profile')}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {profiles.map((p) => (
                <ListBox.Item
                  key={`${p.id}@${p.version}`}
                  id={`${p.id}@${p.version}`}
                  textValue={modbusDisplayName(p, p.name, tBackendMessage)}
                >
                  {modbusDisplayName(p, p.name, tBackendMessage)} v{p.version}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button
          isDisabled={isDisabled}
          variant="danger"
          onPress={() => change({ ...value, devices: value.devices.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeDevice')}
        </Button>
      </div>
      {deviceChannels?.(d.id)}
    </section>
  );
}
