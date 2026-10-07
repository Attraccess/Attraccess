import { randomUUID } from './configuration-id';
import { Button } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import { ModbusConfigurationFormProps } from './ModbusConfigurationForm.modbus-configuration-form-props';

import { ModbusEditorNavigation } from './ModbusEditorNavigation';
import { useModbusConfigurationFormState } from './useModbusConfigurationFormState';

import { renderModbusConfigurationFormConnections } from './renderModbusConfigurationFormConnections';
import { renderModbusConfigurationFormDevices } from './renderModbusConfigurationFormDevices';
import { ModbusProfileForm } from './ModbusProfileForm';
import { ModbusConfigurationFormButton } from './ModbusConfigurationFormButton';

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

export { type ModbusConfigurationFormProps } from './ModbusConfigurationForm.modbus-configuration-form-props';
export { ModbusPointForm } from './ModbusConfigurationForm.modbus-point-form.helpers';
export { ModbusProfileForm } from './ModbusProfileForm';
