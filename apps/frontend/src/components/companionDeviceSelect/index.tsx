import { useCompanionDevicesServiceListCompanionDevices } from '@attraccess/react-query-client';
import { Select, Props as SelectProps } from '../select';

interface Props {
  selectedId?: number;
  onSelectionChange: (id: number) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function CompanionDeviceSelect(
  props: Props &
    Omit<SelectProps, 'items' | 'label' | 'placeholder' | 'value' | 'onChange' | 'data-cy' | 'isLoading' | 'children'>,
) {
  const { selectedId, onSelectionChange, placeholder, ...selectProps } = props;
  const { data: devices } = useCompanionDevicesServiceListCompanionDevices();

  return (
    <Select
      items={(devices ?? []).map((d) => ({ key: d.id.toString(), label: d.name }))}
      placeholder={devices?.find((d) => d.id === selectedId)?.name ?? placeholder}
      value={selectedId?.toString() ?? ''}
      onChange={(key) => onSelectionChange(Number(key))}
      data-cy="companion-device-select"
      {...selectProps}
    />
  );
}
