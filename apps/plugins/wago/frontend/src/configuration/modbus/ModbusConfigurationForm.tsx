import { Button } from '@heroui/react';
import { useState, type ReactNode } from 'react';
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  validateModbus,
  type ModbusConfiguration,
  type ModbusProfile,
} from '../../../../modbus/model';
import { randomUUID } from '../identity';
import { useWagoTranslations } from '../../i18n';
import { AddModbusDeviceButton } from './AddModbusDeviceButton';
import { modbusDisplayName } from './modbus-labels';
import { ModbusConnectionForm } from './ModbusConnectionForm';
import { ModbusDeviceForm } from './ModbusDeviceForm';
import { ModbusEditorNavigation, type ModbusEditorSection } from './ModbusEditorNavigation';
import { ModbusProfileForm } from './ModbusProfileForm';

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
  const [section, setSection] = useState<ModbusEditorSection>(value.devices.length ? 'devices' : 'connections');
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
        <ModbusEditorNavigation
          value={value}
          profiles={profiles}
          section={section}
          onSectionChange={setSection}
          items={items}
          selectedId={selectedId}
          onSelect={(key, id) => setSelected((current) => ({ ...current, [key]: id }))}
          isDisabled={isDisabled}
        />
      )}
      <p className="wg:text-sm wg:text-muted">{t('modbus.builtinHint')}</p>
      {value.connections.map(
        (c, index) =>
          (!focused || (section === 'connections' && c.id === selectedId)) && (
            <ModbusConnectionForm
              key={index}
              connection={c}
              index={index}
              value={value}
              onChange={change}
              showIdentifiers={showIdentifiers}
              isDisabled={isDisabled}
            />
          ),
      )}
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
      {value.devices.map(
        (d, index) =>
          (!focused || (section === 'devices' && d.id === selectedId)) && (
            <ModbusDeviceForm
              key={index}
              device={d}
              index={index}
              value={value}
              profiles={profiles}
              onChange={change}
              showIdentifiers={showIdentifiers}
              isDisabled={isDisabled}
              deviceChannels={deviceChannels}
            />
          ),
      )}
      {(!focused || section === 'devices') && (
        <AddModbusDeviceButton isDisabled={isDisabled} onChange={change} value={value} profiles={profiles} />
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
