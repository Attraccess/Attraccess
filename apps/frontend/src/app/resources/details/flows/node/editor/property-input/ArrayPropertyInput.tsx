import { Button } from '@heroui/react';
import { PlusIcon, XIcon } from 'lucide-react';
import { initializeValue } from './schema-values';
import { Property } from './index.property';
import { PropertyViewProps } from './index.property-view-props';
import { PropertyInput } from './index';

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
