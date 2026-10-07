import type { Props } from './index.contracts';
import { Description } from '@heroui/react';
import { Input } from '@heroui/react';
import { Label } from '@heroui/react';
import { TextArea } from '@heroui/react';
import { TextField } from '@heroui/react';
import { Select } from '../../../../../../../components/select';
import type { PropertyViewProps } from './index.contracts';
import type { EnumValue } from './index.contracts';

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
