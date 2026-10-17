import { useBillingServiceGetBillingConfiguration } from '@attraccess/react-query-client';
import { Description, Input, Label, TextArea, TextField, Button } from '@heroui/react';
import { CompanionDeviceSelect } from '../../../../../../../components/companionDeviceSelect/index';
import { useCallback, useMemo } from 'react';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import {
  Property,
  EnumValue,
  Props,
  propertyDescription,
  StringPropertyInput,
  NumberPropertyInput,
  BooleanPropertyInput,
  MqttPropertyInput,
  PropertyViewProps,
} from './ScalarPropertyInputs';
import { PlusIcon, XIcon } from 'lucide-react';
import { initializeValue } from './schema-values';

export function ObjectPropertyInput<TValue>(props: PropertyViewProps<TValue>) {
  const {
    name,
    nodeType,
    schema,
    value,
    hideLabel,
    label,
    description,
    onChange,
    tNodeTranslations: t,
    tNodeExists,
  } = props;
  if (schema.additionalProperties) {
    let content = null;
    if (Object.entries((value ?? {}) as Record<string, unknown>)?.length === 0) {
      content = <p className="text-sm text-default-500">{t('nodes.' + nodeType + '.config.' + name + '.empty')}</p>;
    } else {
      content = (
        <div className="flex flex-col gap-2">
          {Object.entries(value as Record<string, unknown>).map(([key, currentValueOfKey], index) => (
            <div key={index} className="flex gap-2 items-center">
              <TextField
                value={key}
                onChange={(newKey) => {
                  if (newKey !== key && Object.prototype.hasOwnProperty.call(value, newKey)) return;
                  onChange(
                    Object.fromEntries(
                      Object.entries(value as Record<string, unknown>).map(([existing, entryValue]) =>
                        existing === key ? [newKey, currentValueOfKey] : [existing, entryValue],
                      ),
                    ) as TValue,
                  );
                }}
                isRequired
                className="min-w-0 flex-1"
              >
                <Input placeholder="Header name" />
              </TextField>
              <TextField
                value={currentValueOfKey as string}
                onChange={(newValueOfKey) => onChange({ ...value, [key]: newValueOfKey })}
                isRequired
                className="min-w-0 flex-1"
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
        {description && <Description className="whitespace-pre-wrap">{description}</Description>}
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
              onChange({ ...objectValue, [propertyName]: newValue } as TValue, refreshesSchema)
            }
            isRequired={schema.required?.includes(propertyName) ?? false}
          />
        ))}
      </div>
    );
  }
  throw new Error('Unsupported property type: ' + schema.type);
}

export function ArrayPropertyInput<TValue>(props: PropertyViewProps<TValue>) {
  const { name, nodeType, schema, value, hideLabel, label, onChange, tNodeTranslations: t, tNodeExists } = props;
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
                      isRequired={items.required?.includes(propName) ?? false}
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
    const newItem = items ? initializeValue(items as Property<unknown>, undefined, true) : {};
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

export function PropertyInput<TValue>(props: Props<TValue>) {
  const {
    name,
    isRequired,
    schema,
    tNodeTranslations: t,
    tNodeExists,
    nodeType,
    value,
    onChange: onChangeProp,
    hideLabel,
  } = props;
  const onChange = useCallback(
    (newValue: TValue, refreshesSchema = schema.refreshesSchema) => {
      if (!schema.readOnly) onChangeProp(newValue, refreshesSchema || schema.refreshesSchema);
    },
    [onChangeProp, schema.refreshesSchema, schema.readOnly],
  );
  const label = schema.title ?? t('nodes.' + nodeType + '.config.' + name + '.label');

  const description = propertyDescription(props);
  const enumLabel = (item: EnumValue) => {
    const key = `nodes.${nodeType}.config.${name}.enum.${item.const}`;
    return item.title ?? (tNodeExists?.(key) ? t(key) : String(item.const));
  };

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

  if (schema.readOnly) {
    return (
      <TextField
        isReadOnly
        value={value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
      >
        {!hideLabel && <Label>{label}</Label>}
        <TextArea aria-label={label} />
        {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      </TextField>
    );
  }

  if (!configuration && schema.isCurrency) {
    const currencyLabel = label;
    return (
      <TextField isDisabled isRequired={isRequired}>
        {!hideLabel && <Label>{currencyLabel}</Label>}
        <Input type="text" placeholder={hideLabel ? currencyLabel : undefined} />
      </TextField>
    );
  }

  const view = { ...props, label, description, onChange };
  if (schema.selectFromEntity === 'mqttServer') return <MqttPropertyInput {...view} />;

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
      return <StringPropertyInput {...view} enumLabel={enumLabel} />;
    case 'integer':
    case 'number':
      return <NumberPropertyInput {...view} enumLabel={enumLabel} parsedValue={parsedValue} setValue={setValue} />;
    case 'object':
      return <ObjectPropertyInput {...view} />;
    case 'array':
      return <ArrayPropertyInput {...view} />;
    case 'boolean':
      return <BooleanPropertyInput {...view} />;
  }
  throw new Error('Unsupported property type: ' + schema.type);
}

export { type Property } from './ScalarPropertyInputs';
