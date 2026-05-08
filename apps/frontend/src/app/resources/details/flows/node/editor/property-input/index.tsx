import { ResourceFlowNodeDto, useBillingServiceGetBillingConfiguration } from '@attraccess/react-query-client';
import { AutocompleteItem } from "../../../../../../../utils/heroui-compat";
import { NumberInput } from "../../../../../../../utils/heroui-compat";
import { Modal, ModalContent } from '../../../../../../../utils/heroui-compat';
import { Autocomplete, Button, Card, CardContent, Input, ModalBody, ModalHeader, Switch, Textarea } from "@heroui/react";
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect';
import { PlusIcon, XIcon } from 'lucide-react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import { CreateMqttServerForm } from '../../../../../../mqtt/servers/CreateMqttServerPage';

export interface Property<TValue> {
  type: 'string' | 'integer' | 'number' | 'object' | 'boolean' | 'array';
  enum?: Array<string | number>;
  default?: TValue;
  additionalProperties?: {
    type: Property<unknown>['type'];
  };
  items?: {
    type: 'object' | 'string' | 'number' | 'integer' | 'boolean';
    properties?: Record<string, Property<unknown>>;
  };
  stringVariant?: 'multiline';
  exclusiveMinimum?: number;
  maximum?: number;
  selectFromEntity?: 'mqttServer';
  selectFromEntityProperty?: string;
  overrideWithInput?: string;
  isCurrency?: boolean;
}

interface Props<TValue> {
  nodeType: ResourceFlowNodeDto['type'];
  name: string;
  schema: Property<TValue>;
  tNodeTranslations: TFunction;
  value: TValue;
  onChange: (value: TValue) => void;
  isRequired: boolean;
  hideLabel?: boolean;
}

export function PropertyInput<TValue>(props: Props<TValue>) {
  const { name, isRequired, schema, tNodeTranslations: t, nodeType, value, onChange, hideLabel } = props;

  let description = undefined;
  if (schema.overrideWithInput) {
    description = t('nodes.genericConfig.overridableByInput', { fieldName: schema.overrideWithInput });
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
    return (
      <Input
        type="text"
        isDisabled
        label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
        placeholder={hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
        description={description}
        isRequired={isRequired}
      />
    );
  }

  if (schema.selectFromEntity === 'mqttServer') {
    return (
      <>
        <div className="flex gap-2 w-full items-center">
          <div className="flex-grow min-w-0">
            <MqttServerSelect
              selectedId={value as number}
              onSelectionChange={(newValue) => onChange(newValue as TValue)}
              label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
              ariaLabel={t('nodes.' + nodeType + '.config.' + name + '.label')}
              isRequired={isRequired}
              description={description}
              className="w-full"
            />
          </div>
          <Button
            variant="flat"
            color="primary"
            onPress={() => setIsCreateServerOpen(true)}
            data-cy="mqtt-server-select-create-button"
            isIconOnly
            className="h-full min-h-[48px] aspect-square"
          >
            <PlusIcon size={18} />
          </Button>
        </div>

        <Modal isOpen={isCreateServerOpen} onOpenChange={setIsCreateServerOpen} scrollBehavior="inside">
          <ModalContent>
            {(onClose) => (
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
                      onClose();
                    }}
                  />
                </ModalBody>
              </>
            )}
          </ModalContent>
        </Modal>
      </>
    );
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum) {
        return (
          <Autocomplete
            isRequired={isRequired}
            defaultSelectedKey={String(value ?? schema.default ?? '')}
            onSelectionChange={(newValue) => onChange(newValue as TValue)}
            label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
            description={description}
          >
            {schema.enum.map((enumValue) => (
              <AutocompleteItem key={enumValue} id={enumValue}>
                {t('nodes.' + nodeType + '.config.' + name + '.enum.' + enumValue)}
              </AutocompleteItem>
            ))}
          </Autocomplete>
        );
      }

      if (schema.stringVariant === 'multiline') {
        return (
          <Textarea
            isRequired={isRequired}
            label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
            placeholder={hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
            value={value ? String(value) : undefined}
            defaultValue={schema.default ? String(schema.default) : undefined}
            onValueChange={(newValue) => onChange(newValue as TValue)}
            description={description}
          />
        );
      }

      return (
        <Input
          type="text"
          isRequired={isRequired}
          label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
          placeholder={hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
          value={value ? String(value) : undefined}
          defaultValue={schema.default ? String(schema.default) : undefined}
          onValueChange={(newValue) => onChange(newValue as TValue)}
          description={description}
        />
      );
    case 'integer':
    case 'number': {
      const enumValues = schema.enum ?? (isQosField ? [0, 1, 2] : undefined);

      if (enumValues) {
        const selectedKey =
          value !== undefined ? String(value) : schema.default !== undefined ? String(schema.default) : undefined;

        return (
          <Autocomplete
            isRequired={isRequired}
            defaultSelectedKey={selectedKey}
            onSelectionChange={(newValue) => {
              if (newValue === null) {
                return;
              }

              const parsedValue = typeof newValue === 'number' ? newValue : Number(newValue);
              setValue(parsedValue as TValue);
            }}
            label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
            description={description}
          >
            {enumValues.map((enumValue) => (
              <AutocompleteItem key={String(enumValue)} id={String(enumValue)}>
                {t('nodes.' + nodeType + '.config.' + name + '.enum.' + enumValue)}
              </AutocompleteItem>
            ))}
          </Autocomplete>
        );
      }

      return (
        <NumberInput
          isRequired={isRequired}
          label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
          value={Number(parsedValue)}
          defaultValue={schema.default ? Number(schema.default) : undefined}
          onValueChange={(newValue) => setValue(newValue as TValue)}
          minValue={schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : undefined}
          maxValue={schema.maximum}
          description={description}
        />
      );
    }

    case 'object':
      if (schema.additionalProperties) {
        let content = null;
        if (Object.entries((value ?? {}) as Record<string, unknown>)?.length === 0) {
          content = (
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">{t('nodes.' + nodeType + '.config.' + name + '.empty')}</p>
              </CardContent>
            </Card>
          );
        } else {
          content = (
            <div className="flex flex-col gap-2">
              {Object.entries(value as Record<string, unknown>).map(([key, currentValueOfKey], index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    size="sm"
                    placeholder="Header name"
                    value={key}
                    onValueChange={(newKey) => onChange({ ...value, [key]: undefined, [newKey]: currentValueOfKey })}
                    className="flex-1"
                    isRequired={true}
                  />
                  <Input
                    size="sm"
                    placeholder="Header value"
                    value={currentValueOfKey as string}
                    onValueChange={(newValueOfKey) => onChange({ ...value, [key]: newValueOfKey })}
                    className="flex-1"
                    isRequired={true}
                  />
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    color="danger"
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
            {!hideLabel && <small>{t('nodes.' + nodeType + '.config.' + name + '.label')}</small>}
            {content}
            <Button
              size="sm"
              variant="flat"
              startContent={<PlusIcon size={16} />}
              onPress={() => onChange({ ...value, '': '' })}
            >
              {t('nodes.' + nodeType + '.config.' + name + '.add')}
            </Button>
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
        content = (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">{emptyText}</p>
            </CardContent>
          </Card>
        );
      } else {
        content = (
          <div className="flex flex-col gap-2 w-full">
            {arrayValue.map((row, index) => (
              <Card key={index} className="p-2 w-full">
                <CardContent className="p-0">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                    <div className="flex flex-col gap-2 p-2 w-full">
                      {items && items.type === 'object' && items.properties ? (
                        <>
                          {Object.entries(items.properties).map(([propName, propSchema]) => (
                            <PropertyInput
                              key={propName}
                              nodeType={nodeType}
                              tNodeTranslations={t}
                              name={name + '.items.' + propName}
                              schema={propSchema as Property<unknown>}
                              value={(row as Record<string, unknown>)?.[propName]}
                              onChange={(newItemPropValue) => {
                                const newArrayValue = [...arrayValue] as Array<Record<string, unknown>>;
                                newArrayValue[index] = {
                                  ...(newArrayValue[index] ?? {}),
                                  [propName]: newItemPropValue,
                                };
                                onChange(newArrayValue as TValue);
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
                          name={name + '.items'}
                          schema={items as unknown as Property<unknown>}
                          value={row as unknown}
                          onChange={(newItemValue) => {
                            const newArrayValue = [...arrayValue];
                            newArrayValue[index] = newItemValue as unknown;
                            onChange(newArrayValue as TValue);
                          }}
                          isRequired={false}
                          hideLabel
                        />
                      ) : null}
                    </div>
                    <div className="row-span-2 flex items-start p-2">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        color="danger"
                        onPress={() => {
                          const copy = (arrayValue as Array<unknown>).filter((_, i) => i !== index);
                          onChange(copy as TValue);
                        }}
                      >
                        <XIcon size={16} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
          {!hideLabel && <small>{t('nodes.' + nodeType + '.config.' + name + '.label')}</small>}
          {content}
          <Button size="sm" variant="flat" startContent={<PlusIcon size={16} />} onPress={handleAdd}>
            {addText}
          </Button>
        </div>
      );
    }

    case 'boolean':
      return (
        <Switch isSelected={value as boolean} onValueChange={(newValue) => onChange(newValue as TValue)}>
          {!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : null}
        </Switch>
      );
  }

  console.error('Unsupported property type: ' + schema.type, schema);
  throw new Error('Unsupported property type: ' + schema.type);
}
