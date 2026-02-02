import { PageHeader } from '../../../../components/pageHeader';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Background, BackgroundVariant, Controls, ReactFlow, Node, Panel, Edge, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ApiError,
  ResourceFlowEdgeDto,
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTheme } from '@heroui/use-theme';
import { usePtrStore } from '../../../../stores/ptr.store';
import Dagre from '@dagrejs/dagre';
import { Button } from '@heroui/react';
import { CheckIcon, LayoutGridIcon, LogsIcon, PlusIcon, SaveIcon, Download as DownloadIcon, Upload as UploadIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { NodePickerModal } from './nodePickerModal';
import { FlowProvider, useFlowContext } from './flowContext';
import { useQueryClient } from '@tanstack/react-query';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import JSConfetti from 'js-confetti';
import { LogViewer } from './logViewer';
import de from './de.json';
import en from './en.json';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB' });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }),
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

// Efficient comparison functions to replace expensive JSON.stringify operations
function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}

function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

type FlowExportPayload = {
  version: number;
  exportedAt: string;
  nodes: ResourceFlowNodeDto[];
  edges: ResourceFlowEdgeDto[];
};

const FLOW_EXPORT_VERSION = 1;

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
    throw new Error('invalidStructure');
  }

  const flowData =
    Array.isArray(raw.nodes) && Array.isArray(raw.edges)
      ? raw
      : isRecord(raw.flow)
        ? raw.flow
        : null;

  if (!flowData || !Array.isArray(flowData.nodes) || !Array.isArray(flowData.edges)) {
    throw new Error('invalidStructure');
  }

  const nodes = flowData.nodes.map((node) => {
    if (!isRecord(node)) {
      throw new Error('invalidStructure');
    }

    const { id, type, position } = node;
    if (typeof id !== 'string' || typeof type !== 'string' || !isRecord(position)) {
      throw new Error('invalidStructure');
    }

    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('invalidStructure');
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
      throw new Error('invalidStructure');
    }

    const { id, source, target, sourceHandle, targetHandle } = edge;
    if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') {
      throw new Error('invalidStructure');
    }

    if (
      (sourceHandle !== undefined && sourceHandle !== null && typeof sourceHandle !== 'string') ||
      (targetHandle !== undefined && targetHandle !== null && typeof targetHandle !== 'string')
    ) {
      throw new Error('invalidStructure');
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

const jsConfetti = new JSConfetti();

function FlowsPageInner() {
  const { id: resourceId } = useParams();
  const { theme } = useTheme();
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: Number(resourceId) });
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const { t: tNodeTranslations } = useTranslations({
    de: nodesDeTranslations,
    en: nodesEnTranslations,
  });
  const { setPullToRefreshIsEnabled } = usePtrStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPullToRefreshIsEnabled(false);
    return () => {
      setPullToRefreshIsEnabled(true);
    };
  }, [setPullToRefreshIsEnabled]);

  const { data: originalFlowData } = useResourceFlowsServiceGetResourceFlow(
    { resourceId: Number(resourceId) },
    undefined,
    {
      enabled: !!resourceId,
    },
  );

  const toast = useToastMessage();

  const {
    mutate: saveFlow,
    isSuccess: saveSucceeded,
    isError: saveFailed,
    isPending: isSaving,
  } = useResourceFlowsServiceSaveResourceFlow({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId: Number(resourceId) }),
      });
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const { fitView } = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    addNode,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    flowNodeTypes,
  } = useFlowContext();

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
    fileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const importedFlow = parseFlowImport(parsed);

        setNodes(importedFlow.nodes);
        setEdges(importedFlow.edges);

        toast.success({
          title: t('import.success.title'),
          description: t('import.success.description'),
        });
      } catch (error) {
        console.error('Failed to import flow:', error);
        const errorKey =
          error instanceof SyntaxError
            ? 'invalidJson'
            : error instanceof Error && error.message === 'invalidStructure'
              ? 'invalidStructure'
              : 'unknown';

        toast.error({
          title: t('import.error.title'),
          description: t(`import.errors.${errorKey}`),
        });
      } finally {
        input.value = '';
      }
    },
    [setNodes, setEdges, t, toast],
  );

  useEffect(() => {
    if (originalFlowData) {
      setNodes(originalFlowData.nodes);
      setEdges(originalFlowData.edges);
    }
  }, [originalFlowData, setNodes, setEdges]);

  const nodesHaveChanged = useMemo(() => {
    const originalNodes = originalFlowData?.nodes ?? [];

    if (originalNodes.length !== nodes.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalNodes.length; i++) {
      const originalNode = originalNodes[i];
      const currentNode = nodes.find((n) => n.id === originalNode.id);

      if (!currentNode || !areNodesEqual(originalNode, currentNode)) {
        return true;
      }
    }

    return false;
  }, [nodes, originalFlowData?.nodes]);

  const edgesHaveChanged = useMemo(() => {
    const originalEdges = originalFlowData?.edges ?? [];

    if (originalEdges.length !== edges.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalEdges.length; i++) {
      const originalEdge = originalEdges[i];
      const currentEdge = edges.find((e) => e.id === originalEdge.id);

      if (!currentEdge || !areEdgesEqual(originalEdge, currentEdge)) {
        return true;
      }
    }

    return false;
  }, [edges, originalFlowData?.edges]);

  const flowHasChanged = useMemo(() => {
    return nodesHaveChanged || edgesHaveChanged;
  }, [nodesHaveChanged, edgesHaveChanged]);

  const save = useCallback(() => {
    saveFlow({
      resourceId: Number(resourceId),
      requestBody: {
        nodes: nodes as ResourceFlowNodeDto[],
        edges: edges as ResourceFlowEdgeDto[],
      },
    });
  }, [nodes, edges, saveFlow, resourceId]);

  const layout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges]);

  const addStartNode = useCallback(
    (nodeType: string) => {
      let maxX = 0;
      nodes.forEach((node) => {
        maxX = Math.max(maxX, node.position.x);
      });
      const newNode: Node = {
        id: nanoid(),
        position: { x: maxX + 300, y: 0 },
        type: nodeType,
        data: {},
      };
      addNode(newNode);

      fitView({ nodes: [newNode], duration: 1000, maxZoom: 0.9 });
    },
    [addNode, nodes, fitView],
  );

  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const [, setFlowExecutionHadError] = useState(false);

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        setFlowExecutionHadError(true);
        return;
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
        return;
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);

        // Use functional state update to get current error state
        setFlowExecutionHadError((currentErrorState) => {
          if (!currentErrorState) {
            jsConfetti.addConfetti();
          } else {
            jsConfetti.addConfetti({
              emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
              emojiSize: 100,
              confettiNumber: 2,
            });
          }

          // Reset error state for next execution
          return false;
        });
      }
    },
    [setFlowIsRunning, setFlowExecutionHadError],
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);

  const edgesWithCorrectType = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: edge.type ?? 'attraccess-edge',
      animated: flowIsRunning,
    }));
  }, [edges, flowIsRunning]);

  const edgeTypes = useMemo(
    () => ({
      'attraccess-edge': EdgeWithDeleteButton,
    }),
    [],
  );

  return (
    <div className="h-full w-full flex flex-col">
      <PageHeader
        title={t('title', { resourceName: resource?.name })}
        subtitle={t('subtitle')}
        backTo={`/resources/${resourceId}`}
      />

      <div className="w-full h-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
        <ReactFlow
          nodes={nodes}
          edges={edgesWithCorrectType}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode={theme === 'dark' ? 'dark' : 'light'}
          fitView
          defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
          nodeTypes={flowNodeTypes}
          edgeTypes={edgeTypes}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

          <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
            <Button
              isIconOnly
              isLoading={isSaving}
              startContent={saveSucceeded && !flowHasChanged ? <CheckIcon /> : <SaveIcon />}
              onPress={save}
              isDisabled={!flowHasChanged}
              color={saveFailed ? 'danger' : flowHasChanged ? 'primary' : 'default'}
            />
            <Button isIconOnly startContent={<UploadIcon />} onPress={handleImportClick} aria-label={t('actions.import')} />
            <Button
              isIconOnly
              startContent={<DownloadIcon />}
              onPress={handleExport}
              aria-label={t('actions.export')}
            />
            <LogViewer resourceId={Number(resourceId)}>
              {(open) => <Button isIconOnly startContent={<LogsIcon />} onPress={open} />}
            </LogViewer>

            <Button isIconOnly startContent={<LayoutGridIcon />} onPress={layout} />
            <NodePickerModal
              tNodeTranslations={tNodeTranslations}
              onSelect={addStartNode}
              resourceId={Number(resourceId)}
            >
              {(open) => <Button color="primary" isIconOnly startContent={<PlusIcon />} onPress={open} />}
            </NodePickerModal>
          </Panel>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFileChange}
            className="hidden"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const { id: resourceId } = useParams();

  return (
    <FlowProvider resourceId={Number(resourceId)}>
      <FlowsPageInner />
    </FlowProvider>
  );
}
