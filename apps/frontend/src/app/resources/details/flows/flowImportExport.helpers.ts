import type { Edge } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { FlowExportPayload } from './flowImportExport.contracts';
import { FLOW_EXPORT_VERSION } from './flowImportExport.state';
import { ResourceFlowEdgeDto } from '@attraccess/react-query-client';
import { ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { INVALID_STRUCTURE_ERROR } from './flowImportExport.state';
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeNodes(nodes: Node[]): ResourceFlowNodeDto[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type as ResourceFlowNodeDto['type'],
    position: {
      x: Number.isFinite(node.position?.x) ? node.position.x : 0,
      y: Number.isFinite(node.position?.y) ? node.position.y : 0,
    },
    data: isRecord(node.data) ? node.data : {},
  }));
}

export function sanitizeEdges(edges: Edge[]): ResourceFlowEdgeDto[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}

export function buildFlowExport(nodes: Node[], edges: Edge[]): FlowExportPayload {
  return {
    version: FLOW_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    nodes: sanitizeNodes(nodes),
    edges: sanitizeEdges(edges),
  };
}

export function parseFlowImport(raw: unknown): { nodes: ResourceFlowNodeDto[]; edges: ResourceFlowEdgeDto[] } {
  if (!isRecord(raw)) {
    throw new Error(INVALID_STRUCTURE_ERROR);
  }

  const flowData = Array.isArray(raw.nodes) && Array.isArray(raw.edges) ? raw : isRecord(raw.flow) ? raw.flow : null;

  if (!flowData || !Array.isArray(flowData.nodes) || !Array.isArray(flowData.edges)) {
    throw new Error(INVALID_STRUCTURE_ERROR);
  }

  const idMap = new Map<string, string>();

  const nodes = flowData.nodes.map((node) => {
    if (!isRecord(node)) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    const { id, type, position } = node;
    if (typeof id !== 'string' || typeof type !== 'string' || !isRecord(position)) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    const data = isRecord(node.data) ? node.data : {};
    const newId = crypto.randomUUID();
    idMap.set(id, newId);

    return {
      id: newId,
      type: type as ResourceFlowNodeDto['type'],
      position: { x, y },
      data,
    };
  });

  const edges = flowData.edges.map((edge) => {
    if (!isRecord(edge)) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    const { id, source, target, sourceHandle, targetHandle } = edge;
    if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    if (
      (sourceHandle !== undefined && sourceHandle !== null && typeof sourceHandle !== 'string') ||
      (targetHandle !== undefined && targetHandle !== null && typeof targetHandle !== 'string')
    ) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    const newSource = idMap.get(source);
    const newTarget = idMap.get(target);
    if (!newSource || !newTarget) {
      throw new Error(INVALID_STRUCTURE_ERROR);
    }

    return {
      id: crypto.randomUUID(),
      source: newSource,
      target: newTarget,
      sourceHandle: (sourceHandle as string | null | undefined) ?? null,
      targetHandle: (targetHandle as string | null | undefined) ?? null,
    };
  });

  return { nodes, edges };
}
