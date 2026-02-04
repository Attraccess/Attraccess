import { Select, Props as SelectProps } from '../select';
import { useSubFlows } from '../../app/subflows/api';

interface Props {
  selectedId?: number;
  onSelectionChange: (id: number) => void;
  label?: string;
  placeholder?: string;
}

export function SubFlowSelect(
  props: Props &
    Omit<
      SelectProps,
      'items' | 'label' | 'placeholder' | 'selectedKey' | 'onSelectionChange' | 'data-cy' | 'isLoading' | 'children'
    >,
) {
  const { selectedId, onSelectionChange, label, placeholder, ...selectProps } = props;
  const { data: subFlows, isLoading } = useSubFlows();

  return (
    <Select
      items={(subFlows ?? []).map((subFlow) => ({ key: subFlow.id.toString(), label: subFlow.name }))}
      label={label}
      placeholder={subFlows?.find((flow) => flow.id === selectedId)?.name ?? placeholder}
      selectedKey={selectedId?.toString() ?? ''}
      onSelectionChange={(key) => onSelectionChange(Number(key))}
      data-cy="subflow-select"
      isLoading={isLoading}
      {...selectProps}
    />
  );
}
