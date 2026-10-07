import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

export interface Props {
  tNodeTranslations: TFunction;
  tNodeExists?: TExists;
  schema: ResourceFlowNodeSchemaDto;
  node?: NodeProps;
  previewMode?: boolean;
  data?: {
    forceToolbarVisible?: boolean;
    toolbarPosition?: Position;
  };
  validationError?: string;
}
