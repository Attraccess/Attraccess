import { ResourceFlowEdgeDto } from '@attraccess/react-query-client';
import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import type { Edge } from '@xyflow/react';
import type { Node } from '@xyflow/react';

export type FlowExportPayload = {
  version: number;
  exportedAt: string;
  nodes: ResourceFlowNodeDto[];
  edges: ResourceFlowEdgeDto[];
};
export type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export type FlowImportExportProps = {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  resourceId?: number;
  t: TranslationFn;
};
