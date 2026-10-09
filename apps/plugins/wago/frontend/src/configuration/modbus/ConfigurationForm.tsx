import { Button, Description, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import { useState, type ReactNode } from 'react';
import type { ModbusPoint, RegisterFormat } from '../../../../modbus/model';
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  findProfile,
  type ModbusConfiguration,
} from '../../../../modbus/model';
import { randomUUID } from '../identity';
import { useWagoTranslations } from '../../i18n';
import { modbusDisplayName } from './modbus-labels';
import { ModbusConfigurationFormButton } from './SubmitButton';
import { ModbusEditorNavigation } from './ModbusEditorNavigation';
import { ModbusProfileForm } from './ProfileForm';
import { renderModbusConfigurationFormConnections } from './Connections';
import { renderModbusConfigurationFormDevices } from './Devices';
import { useModbusConfigurationFormState } from './useModbusConfigurationFormState';

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

export function Choice({
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

export function Field({
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

export function FormatFields({
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

export function SignalDisclosure({
  label,
  defaultExpanded,
  children,
}: {
  label: string;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="wg:rounded-lg wg:border wg:border-border wg:p-3"
    >
      <summary className="wg:cursor-pointer wg:font-medium">{label}</summary>
      {expanded && children}
    </details>
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
  const model = useModbusConfigurationFormState({
    value,
    onChange,
    isDisabled,
    showIdentifiers,
    collapseProfiles,
    showValidationErrors,
    focused,
    deviceChannels,
  });

  return (
    <section aria-label={model.t('modbus.title')} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
      <ModbusEditorNavigation {...{ focused, model, value, isDisabled }} />
      <p className="wg:text-sm wg:text-muted">{model.t('modbus.builtinHint')}</p>
      {value.connections.map((c, index) =>
        renderModbusConfigurationFormConnections(c, index, {
          focused,
          section: model.section,
          selectedId: model.selectedId,
          change: model.change,
          value,
          t: model.t,
          showIdentifiers,
          isDisabled,
        }),
      )}
      {(!focused || model.section === 'connections') && (
        <Button
          isDisabled={isDisabled}
          variant="secondary"
          onPress={() =>
            model.change({
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
          {model.t('modbus.addConnection')}
        </Button>
      )}
      {value.devices.map((d, index) =>
        renderModbusConfigurationFormDevices(d, index, {
          focused,
          section: model.section,
          selectedId: model.selectedId,
          change: model.change,
          value,
          t: model.t,
          showIdentifiers,
          isDisabled,
          profiles: model.profiles,
          tBackendMessage: model.tBackendMessage,
          deviceChannels,
        }),
      )}
      {(!focused || model.section === 'devices') && (
        <ModbusConfigurationFormButton
          {...{ isDisabled, change: model.change, value, profiles: model.profiles, t: model.t }}
        />
      )}
      {model.profiles.map(
        (p, profileIndex) =>
          (!focused || (model.section === 'profiles' && `${p.id}@${p.version}` === model.selectedId)) && (
            // Profiles are appended and edited in place; the editable ID must not control mount identity.
            <details
              key={profileIndex}
              open={focused || !collapseProfiles || model.openProfiles.has(profileIndex)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                model.setOpenProfiles((current) => {
                  const next = new Set(current);
                  if (open) next.add(profileIndex);
                  else next.delete(profileIndex);
                  return next;
                });
              }}
            >
              <summary className="wg:whitespace-normal wg:break-words">
                {modbusDisplayName(p, p.name, model.tBackendMessage)} v{p.version}
              </summary>
              {(focused || !collapseProfiles || model.openProfiles.has(profileIndex)) && (
                <ModbusProfileForm
                  value={p}
                  collapseSignals={focused}
                  showIdentifiers={showIdentifiers}
                  isDisabled={isDisabled}
                  onChange={(updated) =>
                    model.change({
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
                onPress={() =>
                  model.change({ ...value, profiles: [...value.profiles, duplicateProfile(p, randomUUID())] })
                }
              >
                {model.t('modbus.duplicate', { name: modbusDisplayName(p, p.name, model.tBackendMessage) })}
              </Button>
            </details>
          ),
      )}
      {(!focused || model.section === 'profiles') && (
        <Button
          isDisabled={isDisabled}
          variant="secondary"
          onPress={() =>
            model.change({
              ...value,
              profiles: [
                ...value.profiles,
                { id: randomUUID(), name: 'Custom profile', version: 1, measurements: [], actions: [] },
              ],
            })
          }
        >
          {model.t('modbus.createProfile')}
        </Button>
      )}
      {showValidationErrors && model.errors.length > 0 && (
        <ul role="alert">
          {model.errors.map((error, i) => (
            <li key={i}>
              {error.path}: {model.tBackendMessage(error.message)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export { ModbusProfileForm } from './ProfileForm';

export const emptyFormat: RegisterFormat = {
  address: 0,
  addressBase: 0,
  dataType: 'uint16',
  byteOrder: 'big',
  wordOrder: 'big',
  scale: 1,
  offset: 0,
};
