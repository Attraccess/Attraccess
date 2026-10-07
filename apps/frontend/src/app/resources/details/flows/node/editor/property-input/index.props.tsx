import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { Property } from './index.property';

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
