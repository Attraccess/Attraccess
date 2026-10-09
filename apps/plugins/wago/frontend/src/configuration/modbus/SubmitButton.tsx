import { randomUUID } from '../identity';
import { Button } from '@heroui/react';
import type { useModbusConfigurationFormState } from './useModbusConfigurationFormState';
type Props = Pick<
  ReturnType<typeof useModbusConfigurationFormState>,
  'isDisabled' | 'change' | 'value' | 'profiles' | 't'
>;
export function ModbusConfigurationFormButton({ isDisabled, change, value, profiles, t }: Props) {
  return (
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
  );
}
