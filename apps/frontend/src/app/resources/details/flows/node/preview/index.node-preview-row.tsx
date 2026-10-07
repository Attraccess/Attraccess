import { NodePreviewEntryField } from './index.node-preview-entry-field';

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
