import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
export type NodePreviewEntryField = {
  label: string;
  value: string;
};

export type NodePreviewRow =
  | {
      label: string;
      value: string;
    }
  | {
      label: string;
      entries: Array<{
        title?: string;
        fields: Array<NodePreviewEntryField>;
      }>;
    };

export type NodePreviewData = Array<NodePreviewRow>;
export type PreviewNode = { data: Record<string, unknown> } | null;

export type PreviewBuilder = (t: TFunction, nodeData: PreviewNode) => NodePreviewData;

export interface Props {
  tNodeTranslations: TFunction;
  schema: ResourceFlowNodeSchemaDto;
  resourceId?: number;
}
