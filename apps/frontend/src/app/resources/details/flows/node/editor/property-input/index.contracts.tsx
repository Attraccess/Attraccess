import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { TExists } from '@attraccess/plugins-frontend-ui';
import { TFunction } from '@attraccess/plugins-frontend-ui';
export type EnumValue = { const: string | number; title?: string };
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

export interface PropertyViewProps<TValue> extends Props<TValue> {
  label: string;
  description: React.ReactNode;
}
