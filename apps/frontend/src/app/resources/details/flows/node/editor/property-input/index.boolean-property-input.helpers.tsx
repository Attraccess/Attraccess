import { Description } from '@heroui/react';
import { LabeledSwitch } from '../../../../../../../components/labeledSwitch';
import type { PropertyViewProps } from './index.contracts';
import { Button } from '@heroui/react';
import { ModalBody } from '@heroui/react';
import { ModalHeader } from '@heroui/react';
import { StandardModal } from '../../../../../../../components/standardModal';
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { CreateMqttServerForm } from '../../../../../../mqtt/servers/CreateMqttServerPage';
import { Label } from '@heroui/react';
import { NumberField } from '@heroui/react';
import { NumberFieldDecrementButton } from '@heroui/react';
import { NumberFieldGroup } from '@heroui/react';
import { NumberFieldIncrementButton } from '@heroui/react';
import { NumberFieldInput } from '@heroui/react';
import { Select } from '../../../../../../../components/select';
import { getNumberFieldMinimum } from './number-field-minimum';
import type { EnumValue } from './index.contracts';

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

export function MqttPropertyInput<TValue>(props: PropertyViewProps<TValue>) {
  const { value, isRequired, hideLabel, label, onChange, tNodeTranslations: t } = props;
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  return (
    <>
      <div className="flex gap-2 w-full items-center">
        <div className="flex-grow min-w-0">
          <MqttServerSelect
            selectedId={value as number}
            onSelectionChange={(id) => onChange(id as TValue)}
            label={!hideLabel ? label : undefined}
            ariaLabel={label}
            isRequired={isRequired}
            className="w-full"
          />
        </div>
        <Button
          variant="secondary"
          onPress={() => setIsCreateServerOpen(true)}
          data-cy="mqtt-server-select-create-button"
          isIconOnly
          className="h-full min-h-[48px] aspect-square"
        >
          <PlusIcon size={18} />
        </Button>
      </div>

      <StandardModal isOpen={isCreateServerOpen} onOpenChange={setIsCreateServerOpen} size="md">
        {({ close }) => (
          <>
            <ModalHeader>{t('nodes.genericConfig.createMqttServer')}</ModalHeader>
            <ModalBody>
              <CreateMqttServerForm
                onSuccess={(server) => {
                  onChange(server.id as TValue);
                  setIsCreateServerOpen(false);
                }}
                onCancel={() => {
                  setIsCreateServerOpen(false);
                  close();
                }}
              />
            </ModalBody>
          </>
        )}
      </StandardModal>
    </>
  );
}

export function NumberPropertyInput<TValue>(
  props: PropertyViewProps<TValue> & {
    enumLabel: (item: EnumValue) => string;
    parsedValue: TValue | number;
    setValue: (value: TValue) => void;
  },
) {
  const { name, schema, value, isRequired, hideLabel, label, description, onChange, enumLabel, parsedValue, setValue } =
    props;
  const propertyKey = name.split('.').pop();
  const isQosField = propertyKey === 'qos' || propertyKey === 'subscribeQos';
  const enumValues: EnumValue[] | undefined =
    schema.oneOf ??
    schema.enum?.map((enumValue) => ({ const: enumValue })) ??
    (isQosField ? [0, 1, 2].map((enumValue) => ({ const: enumValue })) : undefined);

  if (enumValues) {
    const isCompatible = enumValues.some((item) => String(item.const) === String(value));
    const selectedValue = isCompatible ? String(value) : '';

    return (
      <Select
        isRequired={isRequired}
        isInvalid={value !== undefined && !isCompatible}
        label={!hideLabel ? label : undefined}
        aria-label={label}
        value={selectedValue}
        onChange={(newValue) => {
          if (newValue == null) return;
          setValue(Number(newValue) as TValue);
        }}
        description={
          <span className="whitespace-pre-wrap">
            {description}
            {value !== undefined && !isCompatible ? <span> Select an available option.</span> : null}
          </span>
        }
        items={enumValues.map((enumValue) => ({
          key: String(enumValue.const),
          label: enumLabel(enumValue),
        }))}
      />
    );
  }

  return (
    <NumberField
      isRequired={isRequired}
      aria-label={label}
      value={Number(parsedValue)}
      onChange={(newValue) => {
        if (!isRequired && Number.isNaN(newValue)) onChange(undefined as TValue);
        else setValue(newValue as TValue);
      }}
      minValue={getNumberFieldMinimum(schema)}
      maxValue={schema.maximum}
      step={schema.multipleOf}
    >
      {!hideLabel && <Label>{label}</Label>}
      {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      <NumberFieldGroup>
        <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
        <NumberFieldInput />
        <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
      </NumberFieldGroup>
    </NumberField>
  );
}
