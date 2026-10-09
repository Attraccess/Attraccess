import {
  Button,
  ModalBody,
  ModalHeader,
  ModalHeading,
  Description,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Input,
  TextArea,
  TextField,
} from '@heroui/react';
import { StandardModal } from '../../../../../../../components/standardModal';
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect/index';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { CreateMqttServerForm } from '../../../../../../mqtt/servers/CreateMqttServerPage';
import { LabeledSwitch } from '../../../../../../../components/labeledSwitch';
import { Select } from '../../../../../../../components/select/index';
import { getNumberFieldMinimum } from './number-field-minimum';
import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

export interface Property<TValue> {
  type: 'string' | 'integer' | 'number' | 'object' | 'boolean' | 'array';
  enum?: Array<string | number>;
  oneOf?: Array<{ const: string | number; title?: string }>;
  default?: TValue;
  additionalProperties?: {
    type: Property<unknown>['type'];
  };
  items?: {
    type: 'object' | 'string' | 'number' | 'integer' | 'boolean';
    properties?: Record<string, Property<unknown>>;
    required?: string[];
  };
  properties?: Record<string, Property<unknown>>;
  required?: string[];
  stringVariant?: 'multiline';
  exclusiveMinimum?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  unit?: string;
  title?: string;
  description?: string;
  refreshesSchema?: boolean;
  readOnly?: boolean;
  selectFromEntity?: 'mqttServer' | 'companionDevice';
  selectFromEntityProperty?: string;
  overrideWithInput?: string;
  isCurrency?: boolean;
}

export interface Props<TValue> {
  nodeType: ResourceFlowNodeDto['type'];
  name: string;
  schema: Property<TValue>;
  tNodeTranslations: TFunction;
  tNodeExists?: TExists;
  value: TValue;
  onChange: (value: TValue, refreshesSchema?: boolean) => void;
  isRequired: boolean;
  hideLabel?: boolean;
}

export function propertyDescription<TValue>(props: Props<TValue>): React.ReactNode {
  const { schema, nodeType, name, tNodeTranslations: t, tNodeExists } = props;
  const helpTextKey = `nodes.${nodeType}.config.${name}.helpText`;
  const docsUrlKey = `nodes.${nodeType}.config.${name}.docsUrl`;
  const docsLabelKey = `nodes.${nodeType}.config.${name}.docsLabel`;
  const helpText = tNodeExists?.(helpTextKey) ? t(helpTextKey) : undefined;
  const docsUrl = tNodeExists?.(docsUrlKey) ? t(docsUrlKey) : undefined;
  const docsLabel = tNodeExists?.(docsLabelKey) ? t(docsLabelKey) : docsUrl;

  let description: React.ReactNode = schema.description
    ? `${schema.description}${schema.unit ? ` (${schema.unit})` : ''}`
    : schema.unit;
  if (schema.overrideWithInput) {
    description = (
      <>
        {description}
        <br />
        {t('nodes.genericConfig.overridableByInput', { fieldName: schema.overrideWithInput })}
      </>
    );
  }
  if (helpText || docsUrl) {
    description = (
      <span className="flex flex-col gap-0.5">
        {description ? <span>{description}</span> : null}
        {helpText ? <span>{helpText}</span> : null}
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary-500 hover:underline w-fit"
          >
            {docsLabel}
          </a>
        ) : null}
      </span>
    );
  }

  return description;
}

export interface PropertyViewProps<TValue> extends Props<TValue> {
  label: string;
  description: React.ReactNode;
}

export type EnumValue = { const: string | number; title?: string };

export function StringPropertyInput<TValue>(
  props: PropertyViewProps<TValue> & { enumLabel: (item: EnumValue) => string },
) {
  const { name, nodeType, schema, value, isRequired, hideLabel, label, description, onChange, enumLabel } = props;
  if (schema.enum || schema.oneOf) {
    const enumValues: EnumValue[] = schema.oneOf ?? schema.enum?.map((enumValue) => ({ const: enumValue })) ?? [];
    const isCompatible = enumValues.some((item) => String(item.const) === String(value));
    return (
      <Select
        isRequired={isRequired}
        isInvalid={value !== undefined && !isCompatible}
        label={!hideLabel ? label : undefined}
        aria-label={label}
        value={isCompatible ? String(value) : ''}
        onChange={(newValue) => onChange(newValue as TValue)}
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

  if (schema.stringVariant === 'multiline') {
    const multilineLabel = label;
    const multilineId = `property-input-${nodeType}-${name}`;
    return (
      <div className="flex flex-col gap-2 w-full">
        {!hideLabel && <Label htmlFor={multilineId}>{multilineLabel}</Label>}
        <TextArea
          id={multilineId}
          aria-label={multilineLabel}
          required={isRequired}
          placeholder={hideLabel ? multilineLabel : undefined}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value as TValue)}
        />
        {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      </div>
    );
  }

  return (
    <TextField
      isRequired={isRequired}
      value={value ? String(value) : ''}
      onChange={(newValue) => onChange(newValue as TValue)}
    >
      {!hideLabel && <Label>{label}</Label>}
      {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      <Input type="text" placeholder={hideLabel ? label : undefined} />
    </TextField>
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
            <ModalHeader>
              <ModalHeading>{t('nodes.genericConfig.createMqttServer')}</ModalHeading>
            </ModalHeader>
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
