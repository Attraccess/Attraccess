import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { Select, Props as SelectProps } from '../select';

interface Props {
  selectedId?: number;
  onSelectionChange: (id: number) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function MqttServerSelect(
  props: Props &
    Omit<
      SelectProps,
      'items' | 'label' | 'placeholder' | 'value' | 'onChange' | 'data-cy' | 'isLoading' | 'children'
    >,
) {
  const { selectedId, onSelectionChange, placeholder, ...selectProps } = props;
  const { data: servers } = useMqttServiceMqttServersGetAll();

  return (
    <Select
      items={(servers ?? []).map((server) => ({ key: server.id.toString(), label: server.name }))}
      placeholder={servers?.find((r) => r.id === selectedId)?.name ?? placeholder}
      value={selectedId?.toString() ?? ''}
      onChange={(key) => onSelectionChange(Number(key))}
      data-cy="mqtt-server-select"
      {...selectProps}
    />
  );
}
