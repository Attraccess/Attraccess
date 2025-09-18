import { ResourceFlowNodeDto, useBillingServiceGetBillingConfiguration } from '@attraccess/react-query-client';
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Card,
  CardBody,
  Input,
  NumberInput,
  Switch,
  Textarea,
} from '@heroui/react';
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect';
import { PlusIcon, XIcon } from 'lucide-react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo } from 'react';
import { apiCurrencyToFrontendCurrency, frontendCurrencyToApiCurrency } from '../../../../../../../utils/currency';

export interface Property<TValue> {
  type: 'string' | 'integer' | 'number' | 'object' | 'boolean';
  enum?: string[];
  default?: TValue;
  additionalProperties?: {
    type: Property<unknown>['type'];
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
}

export function PropertyInput<TValue>(props: Props<TValue>) {
  const { name, isRequired, schema, tNodeTranslations: t, nodeType, value, onChange } = props;

  let description = undefined;
  if (schema.overrideWithInput) {
    description = t('nodes.genericConfig.overridableByInput', { fieldName: schema.overrideWithInput });
  }

  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  const parsedValue = useMemo(() => {
    if (schema.isCurrency) {
      return apiCurrencyToFrontendCurrency(value as number, configuration?.minorUnit ?? 2);
    }
    return value;
  }, [value, schema.isCurrency, configuration]);

  const setValue = useCallback(
    (newValue: TValue) => {
      console.log('setValue', newValue, schema);
      if (schema.isCurrency) {
        if (!configuration) {
          return;
        }
        onChange(frontendCurrencyToApiCurrency(newValue as number, configuration.minorUnit) as TValue);
      } else {
        onChange(newValue);
      }
    },
    [onChange, schema, configuration],
  );

  if (!configuration && schema.isCurrency) {
    return (
      <Input
        type="text"
        isDisabled
        label={t('nodes.' + nodeType + '.config.' + name + '.label')}
        description={description}
        isRequired={isRequired}
      />
    );
  }

  if (schema.selectFromEntity === 'mqttServer') {
    return (
      <MqttServerSelect
        selectedId={value as number}
        onSelectionChange={(newValue) => onChange(newValue as TValue)}
        label={t('nodes.' + nodeType + '.config.' + name + '.label')}
        isRequired={isRequired}
        description={description}
      />
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
            label={t('nodes.' + nodeType + '.config.' + name + '.label')}
            description={description}
          >
            {schema.enum.map((enumValue) => (
              <AutocompleteItem key={enumValue}>
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
            label={t('nodes.' + nodeType + '.config.' + name + '.label')}
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
          label={t('nodes.' + nodeType + '.config.' + name + '.label')}
          value={value ? String(value) : undefined}
          defaultValue={schema.default ? String(schema.default) : undefined}
          onValueChange={(newValue) => onChange(newValue as TValue)}
          description={description}
        />
      );
    case 'integer':
    case 'number':
      return (
        <NumberInput
          isRequired={isRequired}
          label={t('nodes.' + nodeType + '.config.' + name + '.label')}
          value={Number(parsedValue)}
          defaultValue={schema.default ? Number(schema.default) : undefined}
          onValueChange={(newValue) => setValue(newValue as TValue)}
          minValue={schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : undefined}
          maxValue={schema.maximum}
          description={description}
        />
      );

    case 'object':
      if (schema.additionalProperties) {
        let content = null;
        if (Object.entries((value ?? {}) as Record<string, unknown>)?.length === 0) {
          content = (
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('nodes.' + nodeType + '.config.' + name + '.empty')}</p>
              </CardBody>
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
            <small>{t('nodes.' + nodeType + '.config.' + name + '.label')}</small>
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

    case 'boolean':
      return (
        <Switch isSelected={value as boolean} onValueChange={(newValue) => onChange(newValue as TValue)}>
          {t('nodes.' + nodeType + '.config.' + name + '.label')}
        </Switch>
      );
  }

  console.error('Unsupported property type: ' + schema.type, schema);
  throw new Error('Unsupported property type: ' + schema.type);
}
