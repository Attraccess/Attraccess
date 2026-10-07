import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';

export interface Props {
  tNodeTranslations: TFunction;
  schema: ResourceFlowNodeSchemaDto;
  resourceId?: number;
}
