import { useWagoTranslations } from './i18n';
import { BUILTIN_MODBUS_PROFILES, type ModbusProfile } from '../../modbus/model';

export function useModbusProfileFormState({
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
  return { t, tBackendMessage, readonly, value, onChange, isDisabled, showIdentifiers, collapseSignals } as const;
}
