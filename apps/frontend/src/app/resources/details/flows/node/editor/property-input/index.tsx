import { ResourceFlowNodeDto, useBillingServiceGetBillingConfiguration } from '@attraccess/react-query-client';
import { Button, Description, Input, Label, ModalBody, ModalHeader, NumberField, NumberFieldDecrementButton, NumberFieldGroup, NumberFieldIncrementButton, NumberFieldInput, TextArea, TextField } from '@heroui/react';
import { StandardModal } from '../../../../../../../components/standardModal';
import { Select } from '../../../../../../../components/select';
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect';
import { CompanionDeviceSelect } from '../../../../../../../components/companionDeviceSelect';
import { LabeledSwitch } from '../../../../../../../components/labeledSwitch';
import { PlusIcon, XIcon } from 'lucide-react';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import { CreateMqttServerForm } from '../../../../../../mqtt/servers/CreateMqttServerPage';
import { getNumberFieldMinimum } from './number-field-minimum';

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
  selectFromEntity?: 'mqttServer' | 'companionDevice';
  selectFromEntityProperty?: string;
  overrideWithInput?: string;
  isCurrency?: boolean;
}

type EnumValue = { const: string | number; title?: string };

interface Props<TValue> {
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

export function PropertyInput<TValue>(props: Props<TValue>) {
  const { name, isRequired, schema, tNodeTranslations: t, tNodeExists, nodeType, value, onChange: onChangeProp, hideLabel } = props;
  const onChange = useCallback(
    (newValue: TValue, refreshesSchema = schema.refreshesSchema) => onChangeProp(newValue, refreshesSchema),
    [onChangeProp, schema.refreshesSchema],
  );
  const label = schema.title ?? t('nodes.' + nodeType + '.config.' + name + '.label');

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
    description = t('nodes.genericConfig.overridableByInput', { fieldName: schema.overrideWithInput });
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

  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  const parsedValue = useMemo(() => {
    if (schema.isCurrency) {
      return dbCurrencyToUserCurrency(value as number, configuration?.minorUnit ?? 2);
    }
    return value;
  }, [value, schema.isCurrency, configuration]);

  const setValue = useCallback(
    (newValue: TValue) => {
      if (schema.isCurrency) {
        if (!configuration) {
          return;
        }
        onChange(userCurrencyToDbCurrency(newValue as number, configuration.minorUnit) as TValue);
      } else {
        onChange(newValue);
      }
    },
    [onChange, schema, configuration],
  );

  const propertyKey = name.split('.').pop();
  const isQosField = propertyKey === 'qos' || propertyKey === 'subscribeQos';
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);

  if (!configuration && schema.isCurrency) {
    const currencyLabel = label;
    return (
      <TextField isDisabled isRequired={isRequired}>
        {!hideLabel && <Label>{currencyLabel}</Label>}
        <Input type="text" placeholder={hideLabel ? currencyLabel : undefined} />
      </TextField>
    );
  }

  if (schema.selectFromEntity === 'mqttServer') {
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

  if (schema.selectFromEntity === 'companionDevice') {
    return (
      <CompanionDeviceSelect
        selectedId={value as number}
        onSelectionChange={(id) => onChange(id as TValue)}
        label={!hideLabel ? label : undefined}
        ariaLabel={label}
        placeholder={t('nodes.' + nodeType + '.config.' + name + '.placeholder')}
        isRequired={isRequired}
        className="w-full"
      />
    );
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum || schema.oneOf) {
        const enumValues: EnumValue[] = schema.oneOf ?? schema.enum?.map((enumValue) => ({ const: enumValue })) ?? [];
        return (
          <Select
            label={!hideLabel ? label : undefined}
            aria-label={label}
            value={String(value ?? schema.default ?? '')}
            onChange={(newValue) => onChange(newValue as TValue)}
            description={description}
            items={enumValues.map((enumValue) => ({
              key: String(enumValue.const),
              label: enumValue.title ?? t('nodes.' + nodeType + '.config.' + name + '.enum.' + enumValue.const),
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
              value={value ? String(value) : undefined}
              defaultValue={schema.default ? String(schema.default) : undefined}
              onChange={(e) => onChange(e.target.value as TValue)}
            />
            {description && <Description>{description}</Description>}
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
          {description && <Description>{description}</Description>}
          <Input
            type="text"
            placeholder={hideLabel ? label : undefined}
            defaultValue={schema.default ? String(schema.default) : undefined}
          />
        </TextField>
      );
    case 'integer':
    case 'number': {
      const enumValues: EnumValue[] | undefined = schema.oneOf ?? schema.enum?.map((enumValue) => ({ const: enumValue })) ??
        (isQosField ? [0, 1, 2].map((enumValue) => ({ const: enumValue })) : undefined);

      if (enumValues) {
        const selectedValue =
          value !== undefined ? String(value) : schema.default !== undefined ? String(schema.default) : undefined;

        return (
          <Select
            label={!hideLabel ? label : undefined}
            aria-label={label}
            value={selectedValue}
            onChange={(newValue) => {
              if (newValue == null) return;
              setValue(Number(newValue) as TValue);
            }}
            description={description}
            items={enumValues.map((enumValue) => ({
              key: String(enumValue.const),
              label: enumValue.title ?? t('nodes.' + nodeType + '.config.' + name + '.enum.' + enumValue.const),
            }))}
          />
        );
      }

      return (
        <NumberField
          isRequired={isRequired}
          aria-label={label}
          value={Number(parsedValue)}
          defaultValue={schema.default ? Number(schema.default) : undefined}
          onChange={(newValue) => setValue(newValue as TValue)}
          minValue={getNumberFieldMinimum(schema)}
          maxValue={schema.maximum}
          step={schema.multipleOf}
        >
          {!hideLabel && <Label>{label}</Label>}
          {description && <Description>{description}</Description>}
          <NumberFieldGroup>
            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
            <NumberFieldInput />
            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          </NumberFieldGroup>
        </NumberField>
      );
    }

    case 'object':
      if (schema.additionalProperties) {
        let content = null;
        if (Object.entries((value ?? {}) as Record<string, unknown>)?.length === 0) {
          content = (
            <p className="text-sm text-default-500">{t('nodes.' + nodeType + '.config.' + name + '.empty')}</p>
          );
        } else {
          content = (
            <div className="flex flex-col gap-2">
              {Object.entries(value as Record<string, unknown>).map(([key, currentValueOfKey], index) => (
                <div key={index} className="flex gap-2 items-center">
                  <TextField
                    value={key}
                    onChange={(newKey) => onChange({ ...value, [key]: undefined, [newKey]: currentValueOfKey })}
                    isRequired
                    className="flex-1"
                  >
                    <Input placeholder="Header name" />
                  </TextField>
                  <TextField
                    value={currentValueOfKey as string}
                    onChange={(newValueOfKey) => onChange({ ...value, [key]: newValueOfKey })}
                    isRequired
                    className="flex-1"
                  >
                    <Input placeholder="Header value" />
                  </TextField>
                  <Button
                    variant="danger-soft"
                    isIconOnly
                    onPress={() =>
                      onChange(
                        Object.fromEntries(
                          Object.entries(value as Record<string, unknown>).filter(([k]) => k !== key),
                        ) as TValue,
                      )
                    }
                  >
                    <XIcon size={16} />
                  </Button>
                </div>
              ))}
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-2">
            {!hideLabel && <small>{label}</small>}
            {content}
            <Button variant="secondary" onPress={() => onChange({ ...value, '': '' })}>
              <PlusIcon size={16} />
              {t('nodes.' + nodeType + '.config.' + name + '.add')}
            </Button>
          </div>
        );
      }
      if (schema.properties) {
        const objectValue = (value as Record<string, unknown>) ?? {};
        return (
          <div className="flex flex-col gap-4 w-full">
            {!hideLabel && <small>{label}</small>}
            {description && <Description>{description}</Description>}
            {Object.entries(schema.properties).map(([propertyName, property]) => (
              <PropertyInput
                key={propertyName}
                nodeType={nodeType}
                tNodeTranslations={t}
                tNodeExists={tNodeExists}
                name={`${name}.${propertyName}`}
                schema={property}
                value={objectValue[propertyName]}
                onChange={(newValue, refreshesSchema) =>
                  onChange({ ...objectValue, [propertyName]: newValue } as TValue, refreshesSchema)}
                isRequired={schema.required?.includes(propertyName) ?? false}
              />
            ))}
          </div>
        );
      }
      break;

    case 'array': {
      const arrayValue = (value as Array<unknown>) ?? [];
      const items = schema.items;

      const emptyText = t('nodes.' + nodeType + '.config.' + name + '.empty');
      const addText = t('nodes.' + nodeType + '.config.' + name + '.add');

      let content = null;
      if (arrayValue.length === 0) {
        content = <p className="text-sm text-default-500">{emptyText}</p>;
      } else {
        content = (
          <div className="flex flex-col w-full divide-y divide-default-200">
            {arrayValue.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto] gap-2 items-start py-2 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-2 w-full">
                  {items && items.type === 'object' && items.properties ? (
                    <>
                      {Object.entries(items.properties).map(([propName, propSchema]) => (
                        <PropertyInput
                          key={propName}
                          nodeType={nodeType}
                          tNodeTranslations={t}
                          tNodeExists={tNodeExists}
                          name={name + '.items.' + propName}
                          schema={propSchema as Property<unknown>}
                          value={(row as Record<string, unknown>)?.[propName]}
                          onChange={(newItemPropValue, refreshesSchema) => {
                            const newArrayValue = [...arrayValue] as Array<Record<string, unknown>>;
                            newArrayValue[index] = {
                              ...(newArrayValue[index] ?? {}),
                              [propName]: newItemPropValue,
                            };
                            onChange(newArrayValue as TValue, refreshesSchema);
                          }}
                          isRequired={false}
                          hideLabel
                        />
                      ))}
                    </>
                  ) : items ? (
                    <PropertyInput
                      nodeType={nodeType}
                      tNodeTranslations={t}
                      tNodeExists={tNodeExists}
                      name={name + '.items'}
                      schema={items as unknown as Property<unknown>}
                      value={row as unknown}
                      onChange={(newItemValue, refreshesSchema) => {
                        const newArrayValue = [...arrayValue];
                        newArrayValue[index] = newItemValue as unknown;
                        onChange(newArrayValue as TValue, refreshesSchema);
                      }}
                      isRequired={false}
                      hideLabel
                    />
                  ) : null}
                </div>
                <div className="flex items-start">
                  <Button
                    variant="danger-soft"
                    isIconOnly
                    onPress={() => {
                      const copy = (arrayValue as Array<unknown>).filter((_, i) => i !== index);
                      onChange(copy as TValue);
                    }}
                  >
                    <XIcon size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        );
      }

      const handleAdd = () => {
        let newItem: unknown = {};
        if (items) {
          if (items.type === 'object' && items.properties) {
            newItem = {};
          } else if (items.type === 'string') {
            newItem = '';
          } else if (items.type === 'number' || items.type === 'integer') {
            newItem = 0;
          } else if (items.type === 'boolean') {
            newItem = false;
          } else {
            newItem = {};
          }
        }
        onChange([...(arrayValue ?? []), newItem] as TValue);
      };

      return (
        <div className="flex flex-col gap-2 w-full">
          {!hideLabel && <small>{label}</small>}
          {content}
          <Button variant="secondary" onPress={handleAdd}>
            <PlusIcon size={16} />
            {addText}
          </Button>
        </div>
      );
    }

    case 'boolean':
      return (
        <LabeledSwitch isSelected={value as boolean} onChange={(newValue) => onChange(newValue as TValue)}>
          {!hideLabel ? label : null}
        </LabeledSwitch>
      );
  }

  throw new Error('Unsupported property type: ' + schema.type);
}
