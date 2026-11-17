import { Button } from '@heroui/react';
import type { ModbusConfiguration, ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { randomUUID } from '../identity';

interface AddModbusDeviceButtonProps {
  value: ModbusConfiguration;
  profiles: ModbusProfile[];
  onChange: (value: ModbusConfiguration) => void;
  isDisabled: boolean;
}

export function AddModbusDeviceButton({ value, profiles, onChange, isDisabled }: AddModbusDeviceButtonProps) {
  const { t } = useWagoTranslations();
  return (
    <Button
      isDisabled={isDisabled}
      variant="secondary"
      onPress={() =>
        onChange({
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
  );
}
