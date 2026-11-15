import { Button, Description, Label, ListBox, Select } from '@heroui/react';
import { type ReactNode } from 'react';
import type { ModbusPoint } from '../../../../modbus/model';
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
import { Choice } from './FormFields';

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
