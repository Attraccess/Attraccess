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
