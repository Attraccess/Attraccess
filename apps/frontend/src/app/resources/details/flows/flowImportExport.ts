import { useCallback, useMemo } from 'react';
import { type Edge, type Node } from '@xyflow/react';
import { ResourceFlowEdgeDto, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';

export type FlowExportPayload = {
  version: number;
  exportedAt: string;
  nodes: ResourceFlowNodeDto[];
  edges: ResourceFlowEdgeDto[];
};

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

type FlowImportExportProps = {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  resourceId?: number;
  t: TranslationFn;
};

const FLOW_EXPORT_VERSION = 1;
const INVALID_STRUCTURE_ERROR = 'invalidStructure';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeNodes(nodes: Node[]): ResourceFlowNodeDto[] {
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

function sanitizeEdges(edges: Edge[]): ResourceFlowEdgeDto[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}

function buildFlowExport(nodes: Node[], edges: Edge[]): FlowExportPayload {
  return {
    version: FLOW_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    nodes: sanitizeNodes(nodes),
    edges: sanitizeEdges(edges),
  };
}

function parseFlowImport(raw: unknown): { nodes: ResourceFlowNodeDto[]; edges: ResourceFlowEdgeDto[] } {
  if (!isRecord(raw)) {
    throw new Error(INVALID_STRUCTURE_ERROR);
  }

  const flowData =
    Array.isArray(raw.nodes) && Array.isArray(raw.edges)
      ? raw
      : isRecord(raw.flow)
        ? raw.flow
        : null;

  if (!flowData || !Array.isArray(flowData.nodes) || !Array.isArray(flowData.edges)) {
    throw new Error(INVALID_STRUCTURE_ERROR);
  }

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

    return {
      id,
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

    return {
      id,
      source,
      target,
      sourceHandle: sourceHandle ?? null,
      targetHandle: targetHandle ?? null,
    };
  });

  return { nodes, edges };
}

export function useFlowImportExport({
  nodes,
  edges,
  setNodes,
  setEdges,
  resourceId,
  t,
}: FlowImportExportProps) {
  const toast = useToastMessage();

  const exportFileName = useMemo(() => {
    if (resourceId) {
      return `resource-${resourceId}-flow.json`;
    }
    return 'resource-flow.json';
  }, [resourceId]);

  const handleExport = useCallback(() => {
    try {
      const payload = buildFlowExport(nodes, edges);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success({
        title: t('export.success.title'),
        description: t('export.success.description'),
      });
    } catch (error) {
      console.error('Failed to export flow:', error);
      toast.error({
        title: t('export.error.title'),
        description: t('export.error.description'),
      });
    }
  }, [edges, exportFileName, nodes, t, toast]);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    const host = document.body ?? document.documentElement;
    if (!host) {
      return;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      input.remove();
    };

    const handleChange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const importedFlow = parseFlowImport(parsed);

        setNodes(importedFlow.nodes as Node[]);
        setEdges(importedFlow.edges as Edge[]);

        toast.success({
          title: t('import.success.title'),
          description: t('import.success.description'),
        });
      } catch (error) {
        console.error('Failed to import flow:', error);
        const errorKey =
          error instanceof SyntaxError
            ? 'invalidJson'
            : error instanceof Error && error.message === INVALID_STRUCTURE_ERROR
              ? 'invalidStructure'
              : 'unknown';

        toast.error({
          title: t('import.error.title'),
          description: t(`import.errors.${errorKey}`),
        });
      } finally {
        cleanup();
      }
    };

    input.addEventListener('change', handleChange, { once: true });
    window.addEventListener(
      'focus',
      () => {
        if (!cleanedUp && !input.files?.length) {
          cleanup();
        }
      },
      { once: true },
    );

    host.appendChild(input);
    input.click();
  }, [setNodes, setEdges, t, toast]);

  return {
    handleExport,
    handleImportClick,
  };
}
