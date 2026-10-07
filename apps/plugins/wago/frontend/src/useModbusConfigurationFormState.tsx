import { useState } from 'react';
import { useWagoTranslations } from './i18n';
import { modbusDisplayName } from './modbus-labels';
import {
  BUILTIN_MODBUS_PROFILES,
  type ModbusConfiguration,
  type ModbusProfile,
  validateModbus,
} from '../../modbus/model';
import { ModbusConfigurationFormProps } from './ModbusConfigurationForm.modbus-configuration-form-props';

export function useModbusConfigurationFormState({
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
  return {
    t,
    tBackendMessage,
    openProfiles,
    setOpenProfiles,
    section,
    setSection,
    selected,
    setSelected,
    errors,
    profiles,
    items,
    selectedId,
    change,
    value,
    onChange,
    isDisabled,
    showIdentifiers,
    collapseProfiles,
    showValidationErrors,
    focused,
    deviceChannels,
  } as const;
}
