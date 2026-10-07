import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

export interface Props {
  schema: ResourceFlowNodeSchemaDto;
  children: (onOpen: () => void) => React.ReactNode;
  tNodeTranslations: TFunction;
  tNodeExists?: TExists;
}
