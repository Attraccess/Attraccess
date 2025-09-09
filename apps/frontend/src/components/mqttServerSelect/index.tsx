import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { Select, SelectItem, SelectProps } from '@heroui/react';
import { useCallback, useState } from 'react';

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
      'items' | 'label' | 'placeholder' | 'selectedKeys' | 'onSelectionChange' | 'data-cy' | 'isLoading' | 'children'
    >,
) {
  const { selectedId, onSelectionChange, label, placeholder, ...selectProps } = props;
  const { data: servers, isLoading } = useMqttServiceMqttServersGetAll();

  const selectionToSet = useCallback((selection: Props['selectedId']) => {
    return new Set(selection ? [selection] : []);
  }, []);
  const [value, setValue] = useState(selectionToSet(selectedId));

  return (
    <Select
      items={servers ?? []}
      label={label}
      placeholder={servers?.find((r) => r.id === selectedId)?.name ?? placeholder}
      selectedKeys={value}
      onSelectionChange={(keys) => setValue(keys as Set<number>)}
      data-cy="mqtt-server-select"
      isLoading={isLoading}
      {...selectProps}
    >
      {(server) => (
        <SelectItem
          aria-label={server.name}
          key={server.id}
          data-cy={`mqtt-server-select-item-${server.id}`}
          title={server.name}
          description={server.host + ':' + server.port}
        />
      )}
    </Select>
  );
}
