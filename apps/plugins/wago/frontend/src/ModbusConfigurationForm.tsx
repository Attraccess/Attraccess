import { randomUUID } from './configuration-id';
import { Button, Description, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import { useState, type ReactNode } from 'react';
import { useWagoTranslations } from './i18n';
import { modbusDisplayName } from './modbus-labels';
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  findProfile,
  type ModbusConfiguration,
  type ModbusPoint,
  type ModbusProfile,
  type RegisterFormat,
  validateModbus,
} from '../../modbus/model';

export interface ModbusConfigurationFormProps {
  value: ModbusConfiguration;
  onChange: (value: ModbusConfiguration) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
  collapseProfiles?: boolean;
  showValidationErrors?: boolean;
  focused?: boolean;
  deviceChannels?: (deviceId: string) => ReactNode;
}
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
const emptyFormat: RegisterFormat = {
  address: 0,
  addressBase: 0,
  dataType: 'uint16',
  byteOrder: 'big',
  wordOrder: 'big',
  scale: 1,
  offset: 0,
};
function Field({
  label,
  value,
  onChange,
  numeric = false,
  allowEmpty = false,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  numeric?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const display = Number.isNaN(value) ? '' : String(value);
  // Keep incomplete numeric text only while it still represents our own emitted value.
  // An authoritative replacement must take precedence, including while focused.
  const [edit, setEdit] = useState<{ text: string; value: string | number } | null>(null);
  const currentEdit = edit && Object.is(edit.value, value) ? edit : null;
  if (edit && !currentEdit) setEdit(null);
  return (
    <TextField
      isDisabled={disabled}
      isInvalid={numeric && Number.isNaN(value)}
      value={currentEdit?.text ?? display}
      onBlur={() => setEdit(null)}
      onChange={(text) => {
        const emitted = numeric && !allowEmpty && text.trim() === '' ? 'NaN' : text;
        setEdit({ text, value: numeric && !(allowEmpty && text === '') ? Number(emitted) : emitted });
        onChange(emitted);
      }}
    >
      <Label>{label}</Label>
      <Input type="text" inputMode={numeric ? 'decimal' : undefined} />
    </TextField>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
  labels = {},
}: {
  label: string;
  value: string | number;
  labels?: Record<string, string>;
  options: readonly (string | number)[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t, tExists } = useWagoTranslations();
  const optionLabel = (option: string | number) =>
    labels[String(option)] ?? (tExists(`modbus.options.${option}`) ? t(`modbus.options.${option}`) : String(option));
  return (
    <Select isDisabled={disabled} value={String(value)} onChange={(key) => key !== null && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={String(option)} key={option} textValue={optionLabel(option)}>
              {optionLabel(option)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
function FormatFields({
  value,
  onChange,
  disabled,
}: {
  value: RegisterFormat;
  onChange: (value: RegisterFormat) => void;
  disabled: boolean;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
      {(['address', 'scale', 'offset'] as const).map((key) => (
        <Field
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          numeric
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: Number(v) })}
        />
      ))}
      <Choice
        label={t('modbus.addressConvention')}
        value={value.addressBase}
        options={[0, 1]}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, addressBase: Number(v) as 0 | 1 })}
      />
      <Choice
        label={t('modbus.dataType')}
        value={value.dataType}
        options={['uint16', 'int16', 'uint32', 'int32', 'float32']}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, dataType: v as RegisterFormat['dataType'] })}
      />
      {(['byteOrder', 'wordOrder'] as const).map((key) => (
        <Choice
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          options={['big', 'little']}
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <Description>{t('modbus.formatHint')}</Description>
    </div>
  );
}
export function ModbusProfileForm({
  value,
  onChange,
  isDisabled = false,
  showIdentifiers = true,
  collapseSignals = false,
}: {
  value: ModbusProfile;
  onChange: (value: ModbusProfile) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
  collapseSignals?: boolean;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const readonly = isDisabled || BUILTIN_MODBUS_PROFILES.includes(value);
  return (
    <section className="wg:flex wg:flex-col wg:gap-4">
      <header>
        <h3>{modbusDisplayName(value, value.name, tBackendMessage)}</h3>
        <p>{t(readonly ? 'modbus.readonly' : 'modbus.customHint')}</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-4">
        {showIdentifiers && (
          <Field
            label={t('modbus.profileId')}
            value={value.id}
            disabled={readonly}
            onChange={(id) => onChange({ ...value, id })}
          />
        )}
        <Field
          label={t('modbus.profileName')}
          value={modbusDisplayName(value, value.name, tBackendMessage)}
          disabled={readonly}
          onChange={(name) => onChange({ ...value, name })}
        />
        <Field
          label={t('modbus.version')}
          value={value.version}
          numeric
          disabled={readonly}
          onChange={(v) => onChange({ ...value, version: Number(v) })}
        />
        {value.measurements.map((m, index) => {
          const update = (patch: Partial<typeof m>) =>
            onChange({
              ...value,
              measurements: value.measurements.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            });
          return (
            <details key={index} open={!collapseSignals} className="wg:rounded-lg wg:border wg:border-border wg:p-3">
              <summary className="wg:cursor-pointer wg:font-medium">
                {t('modbus.measurementTitle', { name: modbusDisplayName(value, m.name, tBackendMessage) })}
              </summary>
              <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
                {showIdentifiers && (
                  <Field
                    label={t('modbus.measurementId')}
                    value={m.id}
                    disabled={readonly}
                    onChange={(id) => update({ id })}
                  />
                )}
                <Field
                  label={t('modbus.name')}
                  value={modbusDisplayName(value, m.name, tBackendMessage)}
                  disabled={readonly}
                  onChange={(name) => update({ name })}
                />
                <Choice
                  label={t('modbus.readFunction')}
                  value={m.functionCode}
                  options={[3, 4]}
                  disabled={readonly}
                  onChange={(v) => update({ functionCode: Number(v) as 3 | 4 })}
                />
                <FormatFields value={m} disabled={readonly} onChange={update} />
                <Choice
                  label={t('modbus.unit')}
                  value={m.unit}
                  options={['ampere', 'volt', 'watt', 'watt-hour', 'percent']}
                  disabled={readonly}
                  onChange={(v) => update({ unit: v as typeof m.unit })}
                />
                <Choice
                  label={t('modbus.kind')}
                  value={m.kind}
                  options={['live', 'cumulative']}
                  disabled={readonly}
                  onChange={(v) => {
                    update({ kind: v as typeof m.kind, rollover: v === 'live' ? undefined : m.rollover });
                  }}
                />
                <Choice
                  label={t('modbus.precision')}
                  value={m.decimalPlaces ?? 'exact'}
                  options={['exact', 0, 1, 2, 3]}
                  labels={{
                    exact: t('modbus.exact'),
                    0: t('modbus.whole'),
                    1: t('modbus.units', { precision: '0.1' }),
                    2: t('modbus.units', { precision: '0.01' }),
                    3: t('modbus.units', { precision: '0.001' }),
                  }}
                  disabled={readonly}
                  onChange={(v) => update({ decimalPlaces: v === 'exact' ? undefined : Number(v) })}
                />
                <Field
                  label={t('modbus.polling')}
                  value={m.pollIntervalMs}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ pollIntervalMs: Number(v) })}
                />
                {m.kind === 'cumulative' && (
                  <Field
                    label={t('modbus.rollover')}
                    allowEmpty
                    value={m.rollover ?? ''}
                    numeric
                    disabled={readonly}
                    onChange={(v) => update({ rollover: v === '' ? undefined : Number(v) })}
                  />
                )}
                <Button
                  isDisabled={readonly}
                  variant="danger"
                  onPress={() => onChange({ ...value, measurements: value.measurements.filter((_, i) => i !== index) })}
                >
                  {t('modbus.removeMeasurement')}
                </Button>
              </div>
            </details>
          );
        })}
        <Button
          isDisabled={readonly}
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              measurements: [
                ...value.measurements,
                {
                  ...emptyFormat,
                  id: randomUUID(),
                  name: t('modbus.defaultMeasurement'),
                  functionCode: 3,
                  unit: 'watt',
                  kind: 'live',
                  pollIntervalMs: 5000,
                },
              ],
            })
          }
        >
          {t('modbus.addMeasurement')}
        </Button>
        {value.actions.map((a, index) => {
          const update = (patch: Partial<typeof a>) =>
            onChange({
              ...value,
              actions: value.actions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            });
          return (
            <details key={index} open={!collapseSignals} className="wg:rounded-lg wg:border wg:border-border wg:p-3">
              <summary className="wg:cursor-pointer wg:font-medium">
                {t('modbus.actionTitle', { name: modbusDisplayName(value, a.name, tBackendMessage) })}
              </summary>
              <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
                {showIdentifiers && (
                  <Field
                    label={t('modbus.actionId')}
                    value={a.id}
                    disabled={readonly}
                    onChange={(id) => update({ id })}
                  />
                )}
                <Field
                  label={t('modbus.name')}
                  value={modbusDisplayName(value, a.name, tBackendMessage)}
                  disabled={readonly}
                  onChange={(name) => update({ name })}
                />
                <Choice
                  label={t('modbus.writeFunction')}
                  value={a.functionCode}
                  options={[5, 6, 16]}
                  disabled={readonly}
                  onChange={(v) => update({ functionCode: Number(v) as 5 | 6 | 16 })}
                />
                <FormatFields value={a} disabled={readonly} onChange={update} />
                <Field
                  label={t('modbus.onValue')}
                  value={a.onValue}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ onValue: Number(v) })}
                />
                <Field
                  label={t('modbus.offValue')}
                  value={a.offValue}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ offValue: Number(v) })}
                />
                <Button
                  isDisabled={readonly}
                  variant="danger"
                  onPress={() => onChange({ ...value, actions: value.actions.filter((_, i) => i !== index) })}
                >
                  {t('modbus.removeAction')}
                </Button>
              </div>
            </details>
          );
        })}
        <Button
          isDisabled={readonly}
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              actions: [
                ...value.actions,
                {
                  ...emptyFormat,
                  id: randomUUID(),
                  name: t('modbus.defaultAction'),
                  functionCode: 5,
                  onValue: 1,
                  offValue: 0,
                },
              ],
            })
          }
        >
          {t('modbus.addAction')}
        </Button>
      </div>
    </section>
  );
}

export function ModbusConfigurationForm({
  value,
  onChange,
  isDisabled = false,
  showIdentifiers = true,
  collapseProfiles = false,
  showValidationErrors = true,
  focused = false,
  deviceChannels,
}: ModbusConfigurationFormProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  const [openProfiles, setOpenProfiles] = useState<Set<number>>(new Set());
  const [section, setSection] = useState<'connections' | 'devices' | 'profiles'>(
    value.devices.length ? 'devices' : 'connections',
  );
  const [selected, setSelected] = useState<Record<string, string>>({});
  const errors = validateModbus(value);
  const profiles = [...BUILTIN_MODBUS_PROFILES, ...value.profiles];
  const items =
    section === 'profiles'
      ? profiles.map((p) => ({
          id: `${p.id}@${p.version}`,
          name: `${modbusDisplayName(p, p.name, tBackendMessage)} v${p.version}`,
        }))
      : section === 'devices'
        ? value.devices
        : value.connections.map((c, i) => ({
            id: c.id,
            name: t('modbus.connectionTitle', {
              index: i + 1,
              address: c.transport === 'tcp' ? c.host || 'TCP' : c.path,
            }),
          }));
  const selectedId = items.find((item) => item.id === selected[section])?.id ?? items[0]?.id;
  function change(next: ModbusConfiguration) {
    const selectedProfileIndex = profiles.findIndex(
      (profile) => `${profile.id}@${profile.version}` === selected.profiles,
    );
    if (selectedProfileIndex >= BUILTIN_MODBUS_PROFILES.length) {
      const profile = next.profiles[selectedProfileIndex - BUILTIN_MODBUS_PROFILES.length];
      setSelected((current) => ({ ...current, profiles: `${profile.id}@${profile.version}` }));
    }
    for (const key of ['connections', 'devices', 'profiles'] as const) {
      if (next[key].length > value[key].length) {
        const item = next[key][next[key].length - 1];
        setSection(key);
        setSelected((current) => ({
          ...current,
          [key]: key === 'profiles' ? `${item.id}@${(item as ModbusProfile).version}` : item.id,
        }));
      }
    }
    onChange(next);
  }
  return (
    <section aria-label={t('modbus.title')} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
      {focused && (
        <>
          <header>
            <h2 className="wg:text-xl wg:font-semibold">{t('editor.devices')}</h2>
            <p className="wg:text-sm wg:text-muted">{t('modbus.description')}</p>
          </header>
          <nav aria-label={t('modbus.settings')} className="wg:flex wg:flex-wrap wg:gap-2">
            {(['connections', 'devices', 'profiles'] as const).map((key) => (
              <Button
                key={key}
                variant={section === key ? 'secondary' : 'ghost'}
                aria-current={section === key ? 'page' : undefined}
                onPress={() => setSection(key)}
              >
                {t(`modbus.${key}`)} ({key === 'profiles' ? profiles.length : value[key].length})
              </Button>
            ))}
          </nav>
          {!!items.length && (
            <Choice
              label={t(
                section === 'connections'
                  ? 'modbus.editConnections'
                  : section === 'devices'
                    ? 'modbus.editDevices'
                    : 'modbus.editProfiles',
              )}
              value={selectedId ?? ''}
              options={items.map((item) => item.id)}
              labels={Object.fromEntries(items.map((item) => [item.id, item.name]))}
              disabled={isDisabled}
              onChange={(id) => setSelected({ ...selected, [section]: id })}
            />
          )}
          {!items.length && (
            <p className="wg:py-4 wg:text-muted">
              {t(section === 'connections' ? 'modbus.emptyConnections' : 'modbus.emptyDevices')}
            </p>
          )}
        </>
      )}
      <p className="wg:text-sm wg:text-muted">{t('modbus.builtinHint')}</p>
      {value.connections.map((c, index) => {
        if (focused && (section !== 'connections' || c.id !== selectedId)) return null;
        const update = (patch: object) =>
          change({
            ...value,
            connections: value.connections.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          });
        return (
          <section key={index} className="wg:flex wg:flex-col wg:gap-3">
            <h3>
              {t('modbus.connectionTitle', {
                index: index + 1,
                address: c.transport === 'tcp' ? c.host || 'TCP' : c.path,
              })}
            </h3>
            <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
              {showIdentifiers && (
                <Field
                  label={t('modbus.connectionId')}
                  value={c.id}
                  disabled={isDisabled}
                  onChange={(id) => update({ id })}
                />
              )}
              <Choice
                label={t('modbus.transport')}
                value={c.transport}
                options={['tcp', 'rtu']}
                disabled={isDisabled}
                onChange={(v) =>
                  change({
                    ...value,
                    connections: value.connections.map((item, i) =>
                      i === index
                        ? {
                            id: c.id,
                            timeoutMs: c.timeoutMs,
                            reconnectMs: c.reconnectMs,
                            queueLimit: c.queueLimit,
                            ...(v === 'tcp'
                              ? { transport: 'tcp' as const, host: '', port: 502 }
                              : {
                                  transport: 'rtu' as const,
                                  path: '/dev/serial',
                                  baudRate: 9600,
                                  parity: 'none' as const,
                                  stopBits: 1 as const,
                                }),
                          }
                        : item,
                    ),
                  })
                }
              />
              {c.transport === 'tcp' ? (
                <>
                  <Field
                    label={t('modbus.host')}
                    value={c.host}
                    disabled={isDisabled}
                    onChange={(host) => update({ host })}
                  />
                  <Field
                    label={t('modbus.port')}
                    value={c.port}
                    numeric
                    disabled={isDisabled}
                    onChange={(v) => update({ port: Number(v) })}
                  />
                </>
              ) : (
                <>
                  <p className="wg:text-sm wg:text-muted">{t('modbus.serialHint')}</p>
                  <Field
                    label={t('modbus.path')}
                    value={c.path}
                    disabled={isDisabled}
                    onChange={(path) => update({ path })}
                  />
                  <Choice
                    label={t('modbus.baud')}
                    value={c.baudRate}
                    options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]}
                    disabled={isDisabled}
                    onChange={(v) => update({ baudRate: Number(v) })}
                  />
                  <Choice
                    label={t('modbus.parity')}
                    value={c.parity}
                    options={['none', 'even', 'odd']}
                    disabled={isDisabled}
                    onChange={(parity) => update({ parity })}
                  />
                  <Choice
                    label={t('modbus.stopBits')}
                    value={c.stopBits}
                    options={[1, 2]}
                    disabled={isDisabled}
                    onChange={(v) => update({ stopBits: Number(v) })}
                  />
                </>
              )}
              {(['timeoutMs', 'reconnectMs', 'queueLimit'] as const).map((key) => (
                <Field
                  key={key}
                  label={t(`modbus.${key}`)}
                  value={c[key]}
                  numeric
                  disabled={isDisabled}
                  onChange={(v) => update({ [key]: Number(v) })}
                />
              ))}
              <Button
                isDisabled={isDisabled}
                variant="danger"
                onPress={() => change({ ...value, connections: value.connections.filter((_, i) => i !== index) })}
              >
                {t('modbus.removeConnection')}
              </Button>
            </div>
          </section>
        );
      })}
      {(!focused || section === 'connections') && (
        <Button
          isDisabled={isDisabled}
          variant="secondary"
          onPress={() =>
            change({
              ...value,
              connections: [
                ...value.connections,
                {
                  id: randomUUID(),
                  transport: 'tcp',
                  host: '',
                  port: 502,
                  timeoutMs: 1000,
                  reconnectMs: 250,
                  queueLimit: 16,
                },
              ],
            })
          }
        >
          {t('modbus.addConnection')}
        </Button>
      )}
      {value.devices.map((d, index) => {
        if (focused && (section !== 'devices' || d.id !== selectedId)) return null;
        const update = (patch: Partial<typeof d>) =>
          change({ ...value, devices: value.devices.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
        return (
          <section key={index} className="wg:flex wg:flex-col wg:gap-3">
            <h3>{t('modbus.deviceTitle', { name: d.name })}</h3>
            <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
              {showIdentifiers && (
                <Field
                  label={t('modbus.deviceId')}
                  value={d.id}
                  disabled={isDisabled}
                  onChange={(id) => update({ id })}
                />
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
      })}
      {(!focused || section === 'devices') && (
        <Button
          isDisabled={isDisabled}
          variant="secondary"
          onPress={() =>
            change({
              ...value,
              devices: [
                ...value.devices,
                {
                  id: randomUUID(),
                  name: 'Modbus device',
                  connectionId: value.connections[0]?.id ?? '',
                  unitId: 1,
                  profileId: profiles[0].id,
                  profileVersion: profiles[0].version,
                },
              ],
            })
          }
        >
          {t('modbus.addDevice')}
        </Button>
      )}
      {profiles.map(
        (p, profileIndex) =>
          (!focused || (section === 'profiles' && `${p.id}@${p.version}` === selectedId)) && (
            // Profiles are appended and edited in place; the editable ID must not control mount identity.
            <details
              key={profileIndex}
              open={focused || !collapseProfiles || openProfiles.has(profileIndex)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpenProfiles((current) => {
                  const next = new Set(current);
                  if (open) next.add(profileIndex);
                  else next.delete(profileIndex);
                  return next;
                });
              }}
            >
              <summary className="wg:whitespace-normal wg:break-words">
                {modbusDisplayName(p, p.name, tBackendMessage)} v{p.version}
              </summary>
              {(focused || !collapseProfiles || openProfiles.has(profileIndex)) && (
                <ModbusProfileForm
                  value={p}
                  collapseSignals={focused}
                  showIdentifiers={showIdentifiers}
                  isDisabled={isDisabled}
                  onChange={(updated) =>
                    change({
                      ...value,
                      profiles: value.profiles.map((item, i) =>
                        i === profileIndex - BUILTIN_MODBUS_PROFILES.length ? updated : item,
                      ),
                    })
                  }
                />
              )}
              <Button
                className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
                isDisabled={isDisabled}
                variant="secondary"
                onPress={() => change({ ...value, profiles: [...value.profiles, duplicateProfile(p, randomUUID())] })}
              >
                {t('modbus.duplicate', { name: modbusDisplayName(p, p.name, tBackendMessage) })}
              </Button>
            </details>
          ),
      )}
      {(!focused || section === 'profiles') && (
        <Button
          isDisabled={isDisabled}
          variant="secondary"
          onPress={() =>
            change({
              ...value,
              profiles: [
                ...value.profiles,
                { id: randomUUID(), name: 'Custom profile', version: 1, measurements: [], actions: [] },
              ],
            })
          }
        >
          {t('modbus.createProfile')}
        </Button>
      )}
      {showValidationErrors && errors.length > 0 && (
        <ul role="alert">
          {errors.map((error, i) => (
            <li key={i}>
              {error.path}: {tBackendMessage(error.message)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
