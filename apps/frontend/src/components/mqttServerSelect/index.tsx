import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { Select, Props as SelectProps } from '../select';

interface Props {
  selectedId: number;
  onSelectionChange: (id: number) => void;
  label?: string;
  placeholder?: string;
}

export function MqttServerSelect(
  props: Props &
    Omit<
      SelectProps,
      'items' | 'label' | 'placeholder' | 'selectedKey' | 'onSelectionChange' | 'data-cy' | 'isLoading' | 'children'
    >,
) {
  const { selectedId, onSelectionChange, label, placeholder, ...selectProps } = props;
  const { data: servers, isLoading } = useMqttServiceMqttServersGetAll();

  return (
    <Select
      items={(servers ?? []).map((server) => ({ key: server.id.toString(), label: server.name }))}
      label={label}
      placeholder={servers?.find((r) => r.id === selectedId)?.name ?? placeholder}
      selectedKey={selectedId.toString()}
      onSelectionChange={(key) => onSelectionChange(Number(key))}
      data-cy="mqtt-server-select"
      isLoading={isLoading}
      {...selectProps}
    />
  );
}
