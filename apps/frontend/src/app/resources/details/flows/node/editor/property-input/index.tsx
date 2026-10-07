import { useBillingServiceGetBillingConfiguration } from '@attraccess/react-query-client';
import { Description, Input, Label, TextArea, TextField } from '@heroui/react';
import { CompanionDeviceSelect } from '../../../../../../../components/companionDeviceSelect';
import { useCallback, useMemo } from 'react';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import { Property } from './index.property';
import { EnumValue } from './index.enum-value';
import { Props } from './index.props';
import { propertyDescription } from './index.property-description';
import { StringPropertyInput } from './index.string-property-input';
import { NumberPropertyInput } from './index.number-property-input';
import { BooleanPropertyInput } from './index.boolean-property-input';
import { MqttPropertyInput } from './index.mqtt-property-input';
import { ObjectPropertyInput } from './ObjectPropertyInput';
import { ArrayPropertyInput } from './ArrayPropertyInput';

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

export { type Property } from './index.property';
