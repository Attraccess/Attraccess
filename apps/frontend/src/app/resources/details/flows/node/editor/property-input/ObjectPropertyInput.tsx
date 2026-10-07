import { Button, Description, Input, TextField } from '@heroui/react';
import { PlusIcon, XIcon } from 'lucide-react';
import { PropertyViewProps } from './index.property-view-props';
import { PropertyInput } from './index';

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
