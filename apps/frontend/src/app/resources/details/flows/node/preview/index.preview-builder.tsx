import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PreviewNode } from './index.preview-node';
import { NodePreviewData } from './index.node-preview-data';

export type PreviewBuilder = (t: TFunction, nodeData: PreviewNode) => NodePreviewData;
