import { Description } from '@heroui/react';
import { LabeledSwitch } from '../../../../../../../components/labeledSwitch';
import { PropertyViewProps } from './index.property-view-props';

export function BooleanPropertyInput<TValue>(props: PropertyViewProps<TValue>) {
  const { value, hideLabel, label, description, onChange } = props;
  return (
    <div>
      <LabeledSwitch isSelected={value as boolean} onChange={(newValue) => onChange(newValue as TValue)}>
        {!hideLabel ? label : null}
      </LabeledSwitch>
      {description && <Description className="whitespace-pre-wrap">{description}</Description>}
    </div>
  );
}
